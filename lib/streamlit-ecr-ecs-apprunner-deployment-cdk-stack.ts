import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StreamlitEcrDeploymentCdkStack } from './streamlit-ecr-deployment-cdk-stack';
import { IEnvTypes } from '../process-env-typed';
import { StreamlitBaseStackProps } from './StreamlitBaseStackProps';
import { StreamlitVpcDeploymentCdkStack } from './streamlit-vpc-deployment-cdk-stack';
import { StreamlitEcrStackProps } from './StreamlitEcrStackProps';
import { StreamlitEcsStackProps } from './StreamlitEcsStackProps';
import { CdkAppRunnerWithVpcDeploymentStack } from './streamlit-ecr-apprunner-deployment-cdk-stack';

/**
 * Represents a CDK stack for deploying Streamlit ECR and ECS resources.
 *
 * This stack is responsible for setting up the necessary AWS resources for
 * storing Docker images in ECR and running them within ECS. It includes
 * the creation of an ECR repository, a VPC, a PostgreSQL database, and
 * the deployment of the application using AWS App Runner.
 *
 * @extends cdk.Stack
 */
export class CdkStreamlitEcrEcsAppRunnerDeploymentStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: StreamlitBaseStackProps) {
        super(scope, id, props);

        const envTyped: IEnvTypes = {
            ECR_REPOSITORY_NAME: process.env.ECR_REPOSITORY_NAME!,
            APP_NAME: process.env.APP_NAME!,
            IMAGE_VERSION: process.env.IMAGE_VERSION!,
            PORT: process.env.PORT!,
        };

        const ecrStackProps: StreamlitEcrStackProps = {
            repositoryName: envTyped.ECR_REPOSITORY_NAME,
            appName: envTyped.APP_NAME,
            imageVersion: envTyped.IMAGE_VERSION,
            environment: props.environment,
            deployRegion: props.deployRegion,
            platformString: props.platformString,
        };

        const ecrStack = new StreamlitEcrDeploymentCdkStack(this, `${envTyped.APP_NAME}-${props.environment}-${props.deployRegion}-StreamlitEcrDeploymentCdkStack`, {
            ...ecrStackProps,
            stackName: `${envTyped.APP_NAME}-${props.environment}-${props.deployRegion}-StreamlitEcrDeploymentCdkStack`,
            description: `Streamlit ECR deployment stack for ${props.environment} environment in ${props.deployRegion} region.`,
        });

        const vpcStack = new StreamlitVpcDeploymentCdkStack(this, `${envTyped.APP_NAME}-${props.environment}-${props.deployRegion}-StreamlitVpcDeploymentCdkStack`, {
            ...ecrStackProps,
            stackName: `${envTyped.APP_NAME}-${props.environment}-${props.deployRegion}-StreamlitVpcDeploymentCdkStack`,
            description: `Streamlit VPC deployment stack for ${props.environment} environment in ${props.deployRegion} region.`,
        });

        const ecsStackProps: StreamlitEcsStackProps = {
            ...ecrStackProps,
            containerPort: parseInt(envTyped.PORT),
            ecrRepository: ecrStack.ecrRepository,
            vpc: vpcStack.vpc,
        };

        new CdkAppRunnerWithVpcDeploymentStack(this, `${envTyped.APP_NAME}-${props.environment}-${props.deployRegion}-CdkAppRunnerWithVpcDeploymentStack`, {
            ...ecsStackProps,
            stackName: `${envTyped.APP_NAME}-${props.environment}-${props.deployRegion}-CdkAppRunnerWithVpcDeploymentStack`,
            description: `Streamlit App Runner deployment stack for ${props.environment} environment in ${props.deployRegion} region.`,
        });
    }
}
