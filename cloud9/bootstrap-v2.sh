#!/bin/bash

# Cloud9을 처음 수행하기 위한 Role 및 Instance Profile 추가
# (이것은 정확하지 않을 수 있음) Instance Profile은 이후에 AdministratorAccess 권한을 가진 Role에 연결된 Instance Profile로 대체됨.
# (이것은 정확하지 않을 수 있음) Why does "aws cloud9 create-environment-ec2" command NOT support this option with it?
# (참고) https://docs.aws.amazon.com/cloud9/latest/user-guide/ec2-ssm.html
export CLOUD9_SSM_ACCESS_ROLE_POLICY_DOCUMENT=`curl -fsSL https://raw.githubusercontent.com/shkim4u/m2m-travelbuddy/main/cloud9/cloud9-ssm-access-role-trust-policy.json`
echo $CLOUD9_SSM_ACCESS_ROLE_POLICY_DOCUMENT

# AWSCloud9SSMAccessRole 생성 및 권한 부여
aws iam create-role --role-name AWSCloud9SSMAccessRole --path "/service-role/" --assume-role-policy-document "${CLOUD9_SSM_ACCESS_ROLE_POLICY_DOCUMENT}"
aws iam attach-role-policy --role-name AWSCloud9SSMAccessRole --policy-arn arn:aws:iam::aws:policy/AWSCloud9SSMInstanceProfile

# AWSCloud9SSMInstanceProfile 인스턴스 프로파일 생성
aws iam create-instance-profile --instance-profile-name AWSCloud9SSMInstanceProfile --path "/cloud9/"
aws iam add-role-to-instance-profile --role-name AWSCloud9SSMAccessRole --instance-profile-name AWSCloud9SSMInstanceProfile

# 기본 VPC 조회
#export VPC_ID=`aws ec2 describe-vpcs --query "Vpcs[?isDefault==true].VpcId" --output text`
export VPC_ID=`aws ec2 describe-vpcs --filter "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text`
echo $VPC_ID

# 서브넷 조회
export QUOTED_VPC_ID=\'${VPC_ID}\'
#aws ec2 describe-subnets --filter "Name=vpc-id,Values=${QUOTED_VPC_ID}"
export SUBNET_ID=`aws ec2 describe-subnets --query "Subnets[?(VpcId==${QUOTED_VPC_ID} && AvailabilityZone=='ap-northeast-2a')].SubnetId" --output text`
echo $SUBNET_ID

# 우선 Workshop Studio 콘솔에서 "Get AWS CLI credentials"를 통해 AWS Credentials 환경 변수를 설정한 후 실행할 것.
#aws cloud9 create-environment-ec2 --name cloud9-workspace --instance-type c5.9xlarge --connection-type CONNECT_SSM --automatic-stop-time-minutes 10080
aws cloud9 create-environment-ec2 --name cloud9-workspace --instance-type m5.4xlarge --subnet-id ${SUBNET_ID} --connection-type CONNECT_SSM --automatic-stop-time-minutes 10080

# AdministratorAccess 권한이 부여된 Trust Relationship Policy (from GitHub).
export CLOUD9_INSTANCE_ROLE_POLICY_DOCUMENT=`curl -fsSL https://raw.githubusercontent.com/shkim4u/m2m-travelbuddy/main/cloud9/cloud9-admin-role-trust-policy.json`
echo $CLOUD9_INSTANCE_ROLE_POLICY_DOCUMENT

# "cloud9-admin" Role 생성 및 권한 부여
aws iam create-role --role-name cloud9-admin --assume-role-policy-document "${CLOUD9_INSTANCE_ROLE_POLICY_DOCUMENT}"
aws iam attach-role-policy --role-name cloud9-admin --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# Cloud9 인스턴스 프로파일 생성
aws iam create-instance-profile --instance-profile-name cloud9-admin-instance-profile
aws iam add-role-to-instance-profile --role-name cloud9-admin --instance-profile-name cloud9-admin-instance-profile

# Cloud9 EC2의 기본 인스턴스 프로파일 Detach.
# 참고: https://repost.aws/knowledge-center/attach-replace-ec2-instance-profile
EC2_INSTANCE_ID=$(aws ec2 describe-instances --filters Name=tag:Name,Values="*cloud9-workspace*" Name=instance-state-name,Values=running --query "Reservations[*].Instances[*].InstanceId" --output text)
while [[ -z "${EC2_INSTANCE_ID}" ]]; do
  EC2_INSTANCE_ID=$(aws ec2 describe-instances --filters Name=tag:Name,Values="*cloud9-workspace*" Name=instance-state-name,Values=running --query "Reservations[*].Instances[*].InstanceId" --output text)
  echo "Backend instance of Cloud9 is not yet created. Waiting for 5 seconds..."
  sleep 5
done
echo $EC2_INSTANCE_ID

# Cloud9 인스턴스가 실행되기까지 기다림.
STATUS=""
while [ "$STATUS" != "running" ]; do
  # Get the current status of the instance
  STATUS=$(aws ec2 describe-instances --instance-ids ${EC2_INSTANCE_ID} --query 'Reservations[].Instances[].State.Name' --output text)

  if [ "$STATUS" != "running" ]; then
    echo "Instance is not yet running. Waiting for 5 seconds..."
    sleep 5
  fi
done
echo "Cloud9 instance is now running."

export CLOUD_INSTANCE_PROFILE_ASSOCIATION_ID=`aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=${EC2_INSTANCE_ID} --query "IamInstanceProfileAssociations[0].AssociationId" --output text`
echo $CLOUD_INSTANCE_PROFILE_ASSOCIATION_ID
aws ec2 disassociate-iam-instance-profile --association-id ${CLOUD_INSTANCE_PROFILE_ASSOCIATION_ID}

# Cloud9 EC2 인스턴스에 인스턴스 프로파일 부착 (Attach)
aws ec2 associate-iam-instance-profile --iam-instance-profile Name=cloud9-admin-instance-profile --instance-id $EC2_INSTANCE_ID

# 마지막으로 Cloud9 Managed Credentials 비활성화 -> 위에서 생성한 Instance Profile 사용
export C9_PID=`aws cloud9 list-environments --query "environmentIds[0]" --output text`
aws cloud9 update-environment --environment-id ${C9_PID} --managed-credentials-action DISABLE

###

# TODO: Create an IAM user and export credentials to event-engine-1 profile.
