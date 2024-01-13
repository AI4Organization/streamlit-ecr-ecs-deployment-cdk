# README.md for Streamlit ECR/ECS Deployment CDK Repository

This repository contains the AWS Cloud Development Kit (CDK) code for deploying a Streamlit application using Amazon Elastic Container Registry (ECR) and Amazon Elastic Container Service (ECS).

## Architecture

![Streamlit Architecture](StreamlitArchitect.png)

## Running App

![Running Streamlit App](StreamlitApp.png)

## Table of Contents

1. [Introduction](#introduction)
2. [Requirements](#requirements)
3. [Project Structure](#project-structure)
4. [Configuration](#configuration)
5. [Deployment](#deployment)
6. [Usage](#usage)
7. [Testing](#testing)
8. [Utilities](#utilities)

## Introduction

This project provides a CDK setup to deploy a Streamlit application as a Docker container in AWS. The deployment uses ECR for Docker image storage and ECS with Fargate/AppRunner for running the containers.

## Requirements

- AWS CLI configured with Administrator access
- Node.js v14.15.0 or later
- Python 3.8 or later
- Docker
- AWS CDK Toolkit

## Project Structure

- `bin/`: Contains the CDK entry point script.
- `coreservices/`: Contains the Dockerfile and other resources for the Streamlit application.
- `lib/`: Contains CDK stack definitions.
- `test/`: Contains unit tests for CDK stacks.
- `utils/`: Contains utility functions used within the CDK stacks.

## Configuration

Configure the application by setting the following environment variables in a `.env` file at the root of the project:

- `CDK_DEPLOY_REGIONS`: Comma-separated list of AWS regions for deployment.
- `ENVIRONMENTS`: Comma-separated list of deployment environments (e.g., dev, prod).
- `ECR_REPOSITORY_NAME`: Name of the ECR repository for Docker images.
- `APP_NAME`: Name of the Streamlit application.
- `IMAGE_VERSION`: Version tag for the Docker image (defaults to `latest`).
- `PLATFORMS`: Comma-separated list of platforms (e.g., LINUX_AMD64, LINUX_ARM64).
- `PORT`: Port number on which the application will run.

## Deployment

To deploy the application, run the following commands:

```sh
$ cdk bootstrap
$ cdk deploy
```

## Usage

After deployment, the Streamlit application will be accessible through the provided URL output by the CDK deployment process.

## Testing

Run unit tests using the following command:

```sh
$ npm run test
```

## Utilities

Utility scripts are provided in the `utils/` directory to check environment variables and parse platform strings.

## Contributing

Contributions are welcome. Please open an issue or submit a pull request with your changes or suggestions.
