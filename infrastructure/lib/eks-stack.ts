import * as cdk from 'aws-cdk-lib';
import {aws_ec2, aws_eks, aws_iam, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from "constructs";
import {ClusterLoggingTypes, KubernetesVersion} from "aws-cdk-lib/aws-eks";
import {KubectlV26Layer} from '@aws-cdk/lambda-layer-kubectl-v26';
import {HelmCharts, HelmRepositories} from "../config/helm";
import {Role} from "amazon-eks-irsa-cfn";

export class EksStack extends Stack {
    public readonly eksCluster: aws_eks.Cluster;
    public readonly eksDeployRole: aws_iam.Role;

    constructor(
        scope: Construct,
        id: string,
        vpc: aws_ec2.IVpc,
        publicSubnets: aws_ec2.ISubnet[],
        privateSubnets: aws_ec2.ISubnet[],
        clusterName: string,
        serviceName: string,
        clusterAdminIamUser: string,
        clusterAdminIamRole: string,
        props: StackProps
    ) {
        super(scope, id, props);

        const eksClusterRole = new aws_iam.Role(
            this,
            `${clusterName}-${props?.env?.region}-ClusterRole`,
            {
                roleName: `${clusterName}-${props?.env?.region}-ClusterRole`,
                assumedBy: new aws_iam.ServicePrincipal('eks.amazonaws.com'),
                managedPolicies: [
                    aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy')
                ]
            }
        );

        const eksMastersRole = new aws_iam.Role(
            this,
            `${clusterName}-${props?.env?.region}-MasterRole`,
            {
                roleName: `${clusterName}-${props?.env?.region}-MasterRole`,
                assumedBy: new aws_iam.AccountPrincipal(this.account)
            }
        );

        // 👇 Create a security group for EKS cluster and node group.
        const clusterSecurityGroup = new aws_ec2.SecurityGroup(
            this,
            `${clusterName}-SecurityGroup`, {
                vpc,
                allowAllOutbound: true,
                description: 'Security group for EKS cluster',
            }
        );

        clusterSecurityGroup.addIngressRule(
            aws_ec2.Peer.anyIpv4(),
            aws_ec2.Port.tcp(22),
            'Allow SSH',
        );

        clusterSecurityGroup.addIngressRule(
            // aws_ec2.Peer.ipv4('10.220.0.0/19'),
            // aws_ec2.Peer.ipv4(vpcCidr ?? "10.220.0.0/19"),
            aws_ec2.Peer.ipv4(vpc.vpcCidrBlock),
            aws_ec2.Port.allTraffic(),
            'Allow all traffic from inside VPC'
        );
        clusterSecurityGroup.addIngressRule(
            clusterSecurityGroup,
            aws_ec2.Port.allTraffic(),
            'Allow from this (self-referencing)'
        );

        const eksCluster = new aws_eks.Cluster(
            this,
            `${clusterName}`,
            {
                clusterName: clusterName,
                role: eksClusterRole,
                mastersRole: eksMastersRole,
                version: KubernetesVersion.V1_26,
                kubectlLayer: new KubectlV26Layer(this, 'kubectl'),
                outputClusterName: true,
                endpointAccess: aws_eks.EndpointAccess.PUBLIC_AND_PRIVATE,
                vpc: vpc,
                vpcSubnets: [
                    {
                        subnets: privateSubnets
                    }
                ],
                defaultCapacity: 0,
                // defaultCapacityInstance: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.M5, aws_ec2.InstanceSize.XLARGE),
                outputMastersRoleArn: true,
                securityGroup: clusterSecurityGroup,
                clusterLogging: [
                    ClusterLoggingTypes.API,
                    ClusterLoggingTypes.AUDIT,
                    ClusterLoggingTypes.AUTHENTICATOR,
                    ClusterLoggingTypes.CONTROLLER_MANAGER,
                    ClusterLoggingTypes.SCHEDULER
                ]
            }
        );

        /*
         * Service-linked role (SLR) for EKS node group.
         */
        const slrEksNodeGroup = new aws_iam.CfnServiceLinkedRole(
            this,
            'EksNodeGroupSLR',
            {
                awsServiceName: "eks-nodegroup.amazonaws.com"
            }
        );

        /*
         * IAM for managed node group.
         * [2023-06-01] Custom managed node group setting is commented out for simplicity.
         */
        const eksNodeRole = new aws_iam.Role(
            this,
            `${clusterName}-${props?.env?.region}-NodeRole`,
            {
                roleName: `${clusterName}-${props?.env?.region}-NodeRole`,
                assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com")
            }
        );

        eksNodeRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryPowerUser"));
        eksNodeRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryReadOnly"));
        eksNodeRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy"));
        eksNodeRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy"));
        eksNodeRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"));
        eksNodeRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
        // eksNodeRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"));
        // eksNodeRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"));


        // const eksNodeGroup = eksCluster.addNodegroupCapacity(
        const eksNodeGroup = new aws_eks.Nodegroup(
            this,
            `${clusterName}-NodeGroup`,
            {
                cluster: eksCluster,
                amiType: aws_eks.NodegroupAmiType.AL2_X86_64,
                // amiType: eks.NodegroupAmiType.AL2_X86_64_GPU,
                nodegroupName: `${clusterName}-NodeGroup`,
                instanceTypes: [new aws_ec2.InstanceType('m5.xlarge')],
                minSize: 2,
                maxSize: 4,
                desiredSize: 2,
                diskSize: 100,
                capacityType: aws_eks.CapacityType.ON_DEMAND,
                subnets: {
                    subnets: privateSubnets
                },
                nodeRole: eksNodeRole
            }
        );

        // Add an existing user to the master role of Kubernetes for convenience use at AWS console.
        this.addClusterAdminIamUser(eksCluster, clusterAdminIamUser);
        this.addClusterAdminIamRole(eksCluster, clusterAdminIamRole);
        this.addClusterAdminIamRole(eksCluster, "TeamRole");

        // Add service namespace.
        serviceName = serviceName.toLowerCase();
        const serviceNamespace = eksCluster.addManifest(
            `${clusterName}-Namespace`,
            {
                apiVersion: 'v1',
                kind: 'Namespace',
                metadata: {
                    name: serviceName.toLowerCase()
                }
            }
        );

        /*
         * Load balancer controller.
         * Steps below are referred from the EKS documentation at: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html
         * And here: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_eks.AlbController.html
         */
        const albController = new aws_eks.AlbController(
            this,
            'load-balancer-controller', {
                cluster: eksCluster,
                version: aws_eks.AlbControllerVersion.V2_5_1
            }
        );

        /*
         * Install helm chart for cert-manager.
         * https://cert-manager.io/docs/release-notes/release-notes-1.12/
         */
        eksCluster.addHelmChart(
            `${clusterName}-CertManagerChart`,
            {
                repository: HelmRepositories.JETSTACK,
                chart: HelmCharts.CERT_MANAGER,
                release: "cert-manager",
                namespace: "cert-manager",
                createNamespace: true,
                version: "v1.12.1",
                values: {
                    installCRDs: true
                }
            }
        );

        /*
         * Install ArgoCD with helm.
         * Command to change Service Type: ClusterIP -> LoadBalancer
         * kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'
         *
         * References:
         * - https://artifacthub.io/packages/helm/argo/argo-cd
         * - https://argo-cd.readthedocs.io/en/stable/getting_started/
         * - https://argo-cd.readthedocs.io/en/stable/operator-manual/ingress/
         * - https://github.com/argoproj/argo-helm/blob/438f7a26b7518ec1fc4133f12f58cb0b8d1a2765/charts/argo-cd/templates/argocd-server/service.yaml#L18
         * - https://devocean.sk.com/blog/techBoardDetail.do?ID=163103
         */
        eksCluster.addHelmChart(
            `${clusterName}-ArgoCd`,
            {
                repository: "https://argoproj.github.io/argo-helm",
                chart: "argo-cd",
                release: "argocd",
                namespace: "argocd",
                createNamespace: true,
                // version: "v2.7.3",
                values: {
                    installCRDs: true,
                    // To be compliant with JSON notation, we need to write as follows to apply 'server.service.type': 'LoadBalancer'.
                    server: {
                        service: {
                            type: "LoadBalancer"
                        }
                    }
                }
            }
        );

        /*
         * Install Argo Rollout with helm.
         * References:
         * - https://artifacthub.io/packages/helm/argo/argo-rollouts
         * - https://argo-rollouts.readthedocs.io/en/latest/installation/
         * - https://argo-rollouts.readthedocs.io/en/release-1.5/FAQ/
         */
        eksCluster.addHelmChart(
            `${clusterName}-ArgoRollout`,
            {
                repository: "https://argoproj.github.io/argo-helm",
                chart: "argo-rollouts",
                release: "argo-rollouts",
                namespace: "argo-rollouts",
                createNamespace: true,
                values: {
                    installCRDs: true,
                    dashboard: {
                        enabled: true,
                        service: {
                            type: "LoadBalancer"
                        }
                    },
                }
            }
        );

        /**
         * [2023-06-04] Add service account for pod and a role for that.
         */
        // Add flightspecials namespace.
        const flightSpecialNamespace = eksCluster.addManifest(
            `${clusterName}-Namespace-FlightSpecials`,
            {
                apiVersion: 'v1',
                kind: 'Namespace',
                metadata: {
                    name: 'flightspecials'
                }
            }
        );

        const podServiceAccount = eksCluster.addServiceAccount(
            `${clusterName}-PodServiceAccount`,
            {
                name: 'flightspecials-service-account',
                namespace: 'flightspecials'
            }
        );
        // Service Account가 'flightspecials' Namespace에 의존하므로 이를 설정한다.
        podServiceAccount.node.addDependency(flightSpecialNamespace);
        podServiceAccount.addToPrincipalPolicy(
            new aws_iam.PolicyStatement(
                {
                    effect: aws_iam.Effect.ALLOW,
                    actions: [
                        'secretsmanager:GetSecretValue',
                        'secretsmanager:DescribeSecret'
                        // '*'
                    ],
                    resources: [
                        '*'
                    ]
                }
            )
        );
        new cdk.CfnOutput(
            this,
            `${clusterName}-PodServiceAccountName`, {
                value: podServiceAccount.serviceAccountName
            }
        );
        new cdk.CfnOutput(
            this,
            `${clusterName}-PodServiceAccountRoleArn`, {
                value: podServiceAccount.role.roleArn
            }
        );
        new cdk.CfnOutput(
            this,
            `${clusterName}-PodServiceAccountRoleName`, {
                value: podServiceAccount.role.roleName
            }
        );

        this.eksCluster = eksCluster;

        /**
         * Role for push-based pipeline.
         */
        this.eksDeployRole = this.createEksDeployRole(
            this,
            `${clusterName}-${props?.env?.region}-EksDeployRole`,
            eksCluster,
            this.account
        );

        // Print.
        new cdk.CfnOutput(
            this,
            `${clusterName}-EksClusterName`, {
                value: this.eksCluster.clusterName
            }
        );
        new cdk.CfnOutput(
            this,
            `${clusterName}-EksEndPoint`, {
                value: this.eksCluster.clusterEndpoint
            }
        );
        new cdk.CfnOutput(
            this,
            `${clusterName}-EksDeployRoleArn`, {
                value: this.eksDeployRole.roleArn
            }
        );
    }

    addClusterAdminIamUser(cluster: aws_eks.Cluster, iamUserName: string) {
        if (iamUserName) {
            const iamUser = aws_iam.User.fromUserName(this, "eks-cluster-admin-iam-user", iamUserName);
            cluster.awsAuth.addUserMapping(
                iamUser,
                {
                    username: "admin-user",
                    groups: ['system:masters']
                }
            );
        }
    }

    addClusterAdminIamRole(cluster: aws_eks.Cluster, iamRoleName: string) {
        if (iamRoleName) {
            const iamRole = aws_iam.Role.fromRoleName(this, `eks-cluster-admin-iam-role-${iamRoleName}`, iamRoleName);
            cluster.awsAuth.addRoleMapping(
                iamRole,
                {
                    username: "admin-role",
                    groups: ['system:masters']
                }
            );
        }
    }

    createEksDeployRole(scope: Construct, id: string, eksCluster: aws_eks.Cluster, account?: string): aws_iam.Role {
        const role = new aws_iam.Role(
            scope,
            id, {
                roleName: id,		// Let's use id as the role name.
                /*
                 * Let's just allow wider scope of this account to assume this role for quick demo.
                 */
                assumedBy: new aws_iam.AccountRootPrincipal(),
                managedPolicies: [
                    // Just used AdminPolicy for limited time. Strongly apply above managed policies.
                    aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
                ]
            }
        );

        eksCluster.awsAuth.addMastersRole(role);

        return role;
    }
}
