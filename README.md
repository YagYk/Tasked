# Tasked Productivity Platform
![Pipeline Overview]

## Project Overview
Tasked delivers a calm, high-clarity productivity experience backed by the same end-to-end DevOps toolchain. The frontend helps teams capture work, visualize momentum, and celebrate wins with a sleek task board, focus lists, and progress analytics. The supporting infrastructure automates build, security, containerization, and multi-environment delivery across AWS.

### Core Tooling
- **Terraform**: Provisions the base EC2 workstation, Amazon ECR, and Amazon EKS clusters.
- **GitHub**: Version control for application and infrastructure code.
- **Jenkins**: CI/CD automation for validation, scanning, container builds, and packaging.
- **SonarQube**: Static code analysis and enforced quality gates.
- **NPM**: Builds and tests the React application.
- **Aqua Trivy**: Vulnerability scanning for source and container artifacts.
- **Docker**: Containerizes the Tasked application.
- **Amazon ECR**: Stores versioned images used by downstream deployments.
- **Amazon EKS**: Hosts production workloads via managed Kubernetes.
- **ArgoCD**: GitOps continuous deployment into EKS.
- **Prometheus & Grafana**: Observability and alerting for the runtime environment.

## Application Highlights
- Opinionated task board with Today, Upcoming, Backlog, and Completed columns.
- Quick-add workflow with status, priority, and due-date controls for rapid capture.
- Live momentum summary, progress analytics, and focus trio to spotlight critical work.
- Local storage persistence with celebratory feed of recent wins and completion streaks.
- Fully responsive glassmorphism UI tuned for phones, tablets, and desktops.

## Pre-requisites
1. **AWS Account**: Required for provisioning infrastructure. [Create an AWS Account](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-creating.html)
2. **AWS CLI**: Install and configure locally. [AWS CLI Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
3. **Terraform (1.5+)**: Infrastructure as Code tooling. [Terraform on Windows](https://learn.microsoft.com/en-us/azure/developer/terraform/get-started-windows-bash)
4. **Node.js 18+ / NPM**: Needed for local development and Jenkins builds.
5. **Optional**: VS Code or any editor for authoring/pairing.

## Initial AWS & Terraform Setup
1. **IAM User & Credentials**: Create programmatic access keys and configure using `aws configure`.
2. **Key Pair**: Generate an EC2 key pair named `key` (or update `terraform.tfvars` with your own name).
3. **Provision Infrastructure**:
   ```bash
   git clone https://github.com/pandacloud1/DevopsProject2.git
   cd DevopsProject2
   aws configure
   terraform -chdir=terraform_code/ec2_server init
   terraform -chdir=terraform_code/ec2_server apply --auto-approve
   ```
   The EC2 workstation installs Docker, Jenkins, SonarQube, Trivy, kubectl, and supporting CLIs via bootstrap scripts.

> **Tip:** Review `terraform_code/ec2_server/setup.sh` for the full list of bootstrapped tools and ports.

## Jenkins Configuration
1. **Credentials**: Add secrets for SonarQube token (`sonar-token`), AWS access/secret keys, and any DockerHub/ECR credentials under `Manage Jenkins → Credentials → Global`.
2. **Tool Installers**: Configure JDK 17, NodeJS, Docker, and SonarQube Scanner in `Manage Jenkins → Global Tool Configuration` (`JDK`, `NodeJS`, and `SonarQube Scanner` must match names used below).
3. **Plugins**: Install SonarQube Scanner, NodeJS, Docker, Blue Ocean (optional), Prometheus metrics, and Pipeline utility steps.

## CI Pipeline (Build, Scan, Package)
Use the following Jenkins declarative pipeline (`pipeline_script/build_pipeline`) to build Tasked. Update the defaults or parameterize to match your Git repository and AWS account.

```groovy
pipeline {
    agent any

    parameters {
        string(name: 'REPO_URL', defaultValue: 'https://github.com/pandacloud1/DevopsProject2.git', description: 'Git repository URL')
        string(name: 'REPO_BRANCH', defaultValue: 'main', description: 'Git branch to build')
        string(name: 'ECR_REPO_NAME', defaultValue: 'tasked-app', description: 'ECR repository name')
        string(name: 'AWS_ACCOUNT_ID', defaultValue: '123456789012', description: 'AWS Account ID')
    }

    tools {
        jdk 'JDK'
        nodejs 'NodeJS'
    }

    environment {
        SCANNER_HOME = tool 'SonarQube Scanner'
    }

    stages {
        stage('1. Git Checkout') {
            steps {
                git branch: params.REPO_BRANCH, url: params.REPO_URL
            }
        }

        stage('2. SonarQube Analysis') {
            steps {
                withSonarQubeEnv('sonar-server') {
                    sh """
                    $SCANNER_HOME/bin/sonar-scanner \
                    -Dsonar.projectName=tasked-app \
                    -Dsonar.projectKey=tasked-app
                    """
                }
            }
        }

        stage('3. Quality Gate') {
            steps {
                waitForQualityGate abortPipeline: false, credentialsId: 'sonar-token'
            }
        }

        stage('4. Install npm') {
            steps {
                sh 'npm install'
            }
        }

        stage('5. Trivy Scan') {
            steps {
                sh 'trivy fs . > trivy.txt'
            }
        }

        stage('6. Build Docker Image') {
            steps {
                sh "docker build -t ${params.ECR_REPO_NAME} ."
            }
        }

        stage('7. Create ECR repo') {
            steps {
                withCredentials([
                    string(credentialsId: 'access-key', variable: 'AWS_ACCESS_KEY'),
                    string(credentialsId: 'secret-key', variable: 'AWS_SECRET_KEY')
                ]) {
                    sh """
                    aws configure set aws_access_key_id $AWS_ACCESS_KEY
                    aws configure set aws_secret_access_key $AWS_SECRET_KEY
                    aws ecr describe-repositories --repository-names ${params.ECR_REPO_NAME} --region us-east-1 || \\
                    aws ecr create-repository --repository-name ${params.ECR_REPO_NAME} --region us-east-1
                    """
                }
            }
        }

        stage('8. Login to ECR & tag image') {
            steps {
                withCredentials([
                    string(credentialsId: 'access-key', variable: 'AWS_ACCESS_KEY'),
                    string(credentialsId: 'secret-key', variable: 'AWS_SECRET_KEY')
                ]) {
                    sh """
                    aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${params.AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com
                    docker tag ${params.ECR_REPO_NAME} ${params.AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${params.ECR_REPO_NAME}:${BUILD_NUMBER}
                    docker tag ${params.ECR_REPO_NAME} ${params.AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${params.ECR_REPO_NAME}:latest
                    """
                }
            }
        }

        stage('9. Push image to ECR') {
            steps {
                sh """
                docker push ${params.AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${params.ECR_REPO_NAME}:${BUILD_NUMBER}
                docker push ${params.AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${params.ECR_REPO_NAME}:latest
                """
            }
        }

        stage('10. Cleanup Images') {
            steps {
                sh """
                docker rmi ${params.AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${params.ECR_REPO_NAME}:${BUILD_NUMBER}
                docker rmi ${params.AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${params.ECR_REPO_NAME}:latest
                docker images
                """
            }
        }
    }
}
```

## Continuous Deployment with ArgoCD
1. **Create/Update EKS Cluster**: Provision with Terraform modules under `terraform_code/eks_code`.
2. **ArgoCD Bootstrap**: Use `pipeline_script/deployment_pipeline` to configure Prometheus, Grafana, and ArgoCD (defaults updated for Tasked).
3. **Application Deployments**: ArgoCD tracks the manifests in `k8s_files/` (`tasked-app` deployment & service).

### EKS Deployment Pipeline
```groovy
pipeline {
    agent any

    parameters {
        string(name: 'REPO_URL', defaultValue: 'https://github.com/pandacloud1/DevopsProject2.git', description: 'Git repository URL')
        string(name: 'REPO_BRANCH', defaultValue: 'main', description: 'Git branch')
        string(name: 'AWS_REGION', defaultValue: 'us-east-1', description: 'AWS region')
        string(name: 'AWS_ACCOUNT_ID', defaultValue: '123456789000', description: 'AWS account ID')
        string(name: 'ECR_REPO_NAME', defaultValue: 'tasked-app', description: 'ECR repository name')
        string(name: 'VERSION', defaultValue: 'latest', description: 'Image tag to deploy')
        string(name: 'CLUSTER_NAME', defaultValue: 'tasked-cluster', description: 'EKS cluster')
    }

    stages {
        stage('Clone GitHub Repository') {
            steps {
                git branch: params.REPO_BRANCH, url: params.REPO_URL
            }
        }

        stage('Login to EKS') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'access-key', variable: 'AWS_ACCESS_KEY'),
                        string(credentialsId: 'secret-key', variable: 'AWS_SECRET_KEY')
                    ]) {
                        sh "aws eks --region ${params.AWS_REGION} update-kubeconfig --name ${params.CLUSTER_NAME}"
                    }
                }
            }
        }

        stage('Select Image Version') {
            steps {
                script {
                    def imageName = "${params.AWS_ACCOUNT_ID}.dkr.ecr.${params.AWS_REGION}.amazonaws.com/${params.ECR_REPO_NAME}:${params.VERSION}"
                    sh "sed -i 's|image: .*|image: ${imageName}|' k8s_files/deployment.yaml"
                }
            }
        }

        stage('Deploy to EKS') {
            steps {
                sh 'kubectl apply -f k8s_files/deployment.yaml'
                sh 'kubectl apply -f k8s_files/service.yaml'
            }
        }
    }
}
```

## Access & Observability
- `access.sh` helps retrieve ArgoCD, Prometheus, and Grafana endpoints plus initial credentials once services are exposed.
- Prometheus and Grafana are exposed as AWS load balancers via patches in the deployment pipeline.
- The React app listens on port 3000; the Kubernetes `LoadBalancer` service exposes port 80 for end-user traffic.

## Cleanup Pipeline
`pipeline_script/cleanup_pipeline` removes Kubernetes workloads, ArgoCD, Prometheus namespaces, and deletes the Tasked ECR repository. Update defaults carefully before executing in production environments.

## Local Development
```bash
npm install
npm start
```
The development server runs at [http://localhost:3000](http://localhost:3000) with hot reloading.

## Additional Documentation
- `Project_WriteUp.docx` contains deep-dive notes and diagrams.
- `terraform_code/` and `pipeline_script/` include inline comments for customization.

---
# Tasked
# TaskedApp
#
