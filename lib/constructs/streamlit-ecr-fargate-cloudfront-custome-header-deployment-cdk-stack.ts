import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { StreamlitEcsStackProps } from './StreamlitEcsStackProps';
import {
    AllowedMethods,
    CachePolicy,
    Distribution,
    Function,
    FunctionCode,
    FunctionEventType,
    OriginProtocolPolicy,
    OriginRequestCookieBehavior,
    OriginRequestHeaderBehavior,
    OriginRequestPolicy,
    OriginRequestQueryStringBehavior,
    ResponseHeadersPolicy,
    SecurityPolicyProtocol,
} from "aws-cdk-lib/aws-cloudfront";
import { LoadBalancerV2Origin } from "aws-cdk-lib/aws-cloudfront-origins";

/**
 * Represents a CDK stack for deploying a Fargate service within a VPC.
 *
 * This stack sets up the necessary AWS resources to deploy a containerized
 * application using AWS Fargate. It includes setting up an ECS cluster,
 * task definitions, security groups, and an Application Load Balancer.
 * The stack also configures auto-scaling for the Fargate service based on CPU utilization.
 *
 * @param {Construct} scope - The parent construct.
 * @param {string} id - The unique identifier for the stack.
 * @param {StreamlitEcsStackProps} props - The properties for the Fargate deployment stack.
 */
export class CdkFargateFrontWithVpcDeploymentStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props: StreamlitEcsStackProps) {
        super(scope, id, props);

        const containerPort = props.containerPort;
        console.log(`containerPort: ${containerPort}`);

        const existingVpc = props.vpc;

        const loadBalancerSecurityGroup = new ec2.SecurityGroup(this, `${props.appName}-${props.environment}-${props.platformString}-Streamlit-ALB-SecGrp`, { vpc: existingVpc });
        loadBalancerSecurityGroup.addIngressRule(ec2.Peer.ipv4('0.0.0.0/0'), ec2.Port.tcp(80)); // allow all inbound traffic on port 80

        const ecsSecurityGroup = new ec2.SecurityGroup(this, 'Streamlit-ECS-SecurityGroup', { vpc: existingVpc, allowAllOutbound: true });
        ecsSecurityGroup.addIngressRule(loadBalancerSecurityGroup, ec2.Port.tcp(80));
        ecsSecurityGroup.addIngressRule(loadBalancerSecurityGroup, ec2.Port.tcp(containerPort));
        ecsSecurityGroup.addIngressRule(ecsSecurityGroup, ec2.Port.allTraffic());

        // define a cluster with spot instances, linux type
        const cluster = new ecs.Cluster(this, `${props.appName}-${props.environment}-${props.platformString}-DeploymentCluster`, {
            vpc: existingVpc,
            containerInsights: true,
            clusterName: `${props.appName}-${props.environment}-Cluster`,
        });

        // Task Role
        const taskRole = new iam.Role(this, `${props.appName}-${props.environment}-${props.platformString}-ecsTaskExecutionRole`, {
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        });

        // Add permissions to the Task Role
        taskRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                "service-role/AmazonECSTaskExecutionRolePolicy"
            )
        );

        // Add permissions to the Task Role to allow it to pull images from ECR
        taskRole.addToPolicy(new iam.PolicyStatement(
            {
                effect: iam.Effect.ALLOW,
                actions: [
                    "ecr:GetAuthorizationToken",
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                resources: ["*"],
            }
        ));

        const loadBalancer = new elbv2.ApplicationLoadBalancer(
            this,
            `${props.appName}-${props.environment}-${props.platformString}-StreamlitLoadBalancer`,
            {
                vpc: props.vpc,
                securityGroup: loadBalancerSecurityGroup,
                internetFacing: true,
            }
        );

        // create a task definition with CloudWatch Logs
        const logDriver = new ecs.AwsLogDriver({ streamPrefix: `${props.appName}-${props.environment}-${props.platformString}` });

        // Instantiate Fargate Service with just cluster and image
        const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, `${props.appName}-${props.environment}-${props.platformString}-FargateService`, {
            cluster,
            taskImageOptions: {
                image: ecs.ContainerImage.fromEcrRepository(props.ecrRepository, props.imageVersion),
                taskRole,
                containerPort,
                enableLogging: true,
                logDriver,
            },
            loadBalancer,
            securityGroups: [ecsSecurityGroup],
            cpu: 1024,
            memoryLimitMiB: 2048,
            desiredCount: 1,
            platformVersion: ecs.FargatePlatformVersion.LATEST,
            runtimePlatform: {
                cpuArchitecture: props.platformString === `arm` ? ecs.CpuArchitecture.ARM64 : ecs.CpuArchitecture.X86_64,
                operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
            },
        });

        // Setup AutoScaling policy
        const scaling = fargateService.service.autoScaleTaskCount({ maxCapacity: 2, minCapacity: 1 });
        scaling.scaleOnCpuUtilization(`${props.appName}-${props.environment}-${props.platformString}-CpuScaling`, {
            targetUtilizationPercent: 70,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
        });

        fargateService.targetGroup.configureHealthCheck({
            path: "/",
            interval: cdk.Duration.seconds(60),
            healthyHttpCodes: "200-499", // We have to check for 401 as the default state of "/" is unauthenticated
        });

        // Cloudfront Distribution
        const streamlitOriginRequestPolicy = new OriginRequestPolicy(
            this,
            `${props.appName}-${props.environment}-${props.platformString}-OriginRequestPolicy`,
            {
                originRequestPolicyName: "StreamlitPolicy",
                comment: "Policy optimised for Streamlit",
                cookieBehavior: OriginRequestCookieBehavior.all(),
                headerBehavior: OriginRequestHeaderBehavior.all(),
                queryStringBehavior: OriginRequestQueryStringBehavior.all(),
            }
        );

        /** Fixes Cors Issue */
        const corsFunction = new Function(this, `${props.appName}-${props.environment}-${props.platformString}-CorsFunction`, {
            code: FunctionCode.fromInline(`
                function handler(event) {
                    if(event.request.method === 'OPTIONS') {
                        var response = {
                            statusCode: 204,
                            statusDescription: 'OK',
                            headers: {
                                'access-control-allow-origin': { value: '*' },
                                'access-control-allow-headers': { value: '*' }
                            }
                        };
                        return response;
                    }
                    return event.request;
                }
            `),
        });

        // custom header object
        const customHeaderName = 'X-Verify-Origin';
        const customHeaderValue = `${props.appName}-StreamlitCloudFrontDistribution`;

        const streamlitDistribution = new Distribution(this, `${props.appName}-${props.environment}-${props.platformString}-StreamlitDistribution`, {
            defaultBehavior: {
                origin: new LoadBalancerV2Origin(loadBalancer, {
                    protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
                    customHeaders: {
                        custom_header_name: customHeaderValue,
                    }
                }),
                originRequestPolicy: streamlitOriginRequestPolicy,
                responseHeadersPolicy: ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
                cachePolicy: CachePolicy.CACHING_DISABLED,
                allowedMethods: AllowedMethods.ALLOW_ALL,
                compress: true,
                viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                functionAssociations: [
                    {
                        function: corsFunction,
                        eventType: FunctionEventType.VIEWER_REQUEST,
                    },
                ],
            },
            minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
            comment: "CloudFront distribution for Streamlit frontend application.",
        });

        // Create deny rule for ALB
        // Add a rule to deny traffic if custom header is absent
        new elbv2.ApplicationListenerRule(this, `${props.appName}-${props.environment}-${props.platformString}-elbv2-StreamlitApplicationListenerRule`,
            {
                listener: fargateService.listener,
                priority: 1,
                conditions: [elbv2.ListenerCondition.httpHeader(customHeaderName, [customHeaderValue])],
                action: elbv2.ListenerAction.forward([fargateService.targetGroup])
            }
        );

        new elbv2.ApplicationListenerRule(this, `${props.appName}-${props.environment}-${props.platformString}-elbv2-RedirectApplicationListenerRule`,
            {
                listener: fargateService.listener,
                priority: 5,
                conditions: [elbv2.ListenerCondition.pathPatterns(["*"])],
                action: elbv2.ListenerAction.redirect({
                    host: streamlitDistribution.distributionDomainName,
                    permanent: true,
                    protocol: "HTTPS",
                    port: "443",
                }),
            }
        );

        new cdk.CfnOutput(this, `${props.appName}-${props.environment}-${props.platformString}-StreamlitURL`, {
            value: `https://${streamlitDistribution.distributionDomainName}`,
            description: "Streamlit CloudFront Distribution URL.",
            exportName: `${props.appName}-${props.environment}-${props.platformString}-StreamlitDistributionURL`,
        });
    }
}
