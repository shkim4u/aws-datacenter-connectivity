#!/bin/bash

# 1. IDE IAM 설정 확인
echo "1. Checking Cloud9 IAM role..."
rm -vf ${HOME}/.aws/credentials
aws sts get-caller-identity --query Arn | grep cloud9-admin

# 2. (Optional for Amazon EKS) EKS 관련 도구
## 2.1. Kubectl
# 설치
echo "2.1. Installing kubectl..."
sudo curl -o /usr/local/bin/kubectl  \
   https://s3.us-west-2.amazonaws.com/amazon-eks/1.27.1/2023-04-19/bin/linux/amd64/kubectl
# 실행 모드 변경
sudo chmod +x /usr/local/bin/kubectl
# 설치 확인
kubectl version --short --client

## 2.2. eksctl 설치
echo "2.2. Installing eksctl..."
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv -v /tmp/eksctl /usr/local/bin
eksctl version

## 2.3. k9s 설치
echo "2.3. Installing k9s..."
curl -sL https://github.com/derailed/k9s/releases/download/v0.27.4/k9s_Linux_amd64.tar.gz | sudo tar xfz - -C /usr/local/bin
k9s version

## 2.4 Helm 설치
echo "2.4. Installing Helm..."
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version --short

## 3. Upgrade AWS CLI.
echo "3. Upgrading AWS CLI..."
aws --version

echo "3.1. Removing the AWS CLI Version 1..."
sudo rm /usr/bin/aws
sudo rm /usr/bin/aws_completer
sudo rm -rf /usr/local/aws-cli

echo "3.1. Installing AWS CLI Version 2..."
rm -rf ./aws | true
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
sudo ./aws/install
hash -d aws
aws --version

## 4. Upgrade AWS CDK.
echo "4. Upgrading AWS CDK..."
npm uninstall -g aws-cdk
rm -rf $(which cdk)
npm install -g aws-cdk
cdk --version

## 5. Installing Misc.
echo "5. Installing miscellaneous tools..."

echo "5.1. Installing AWS SSM Session Manager..."
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm" -o "session-manager-plugin.rpm"
sudo yum install -y session-manager-plugin.rpm

echo "5.2. Installing AWS Cloud9 CLI..."
npm install -g c9

echo "5.3. Installing jq..."
sudo yum install -y jq

echo "5.4. Installing yq..."
sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
sudo chmod a+x /usr/local/bin/yq
yq --version

echo "5.5. Installing bash-completion..."
sudo yum install -y bash-completion

## 6. Addition Cloud9 configurations.
echo "6. Additional Cloud9 configurations..."

echo "6.1. Configuring AWS_REGION..."
export AWS_REGION=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.region')

echo "export AWS_REGION=${AWS_REGION}" | tee -a ~/.bash_profile

aws configure set default.region ${AWS_REGION}

# 확인
aws configure get default.region

echo "6.2. Configuring AWS ACCOUNT_ID..."
export ACCOUNT_ID=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.accountId')

echo "export ACCOUNT_ID=${ACCOUNT_ID}" | tee -a ~/.bash_profile

## 7. Extend disk size.
echo "7. Extending disk size..."
curl -fsSL https://raw.githubusercontent.com/shkim4u/kubernetes-misc/main/aws-cloud9/resize.sh | bash
df -h

