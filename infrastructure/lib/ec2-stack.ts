import * as cdk from 'aws-cdk-lib';
import {Construct} from "constructs";
import {aws_ec2, Stack, StackProps} from "aws-cdk-lib";
import {Role} from "aws-cdk-lib/aws-iam";

export class Ec2Stack extends Stack {
    constructor(
        scope: Construct,
        id: string,
        vpc: aws_ec2.IVpc,
        privateSubnets: aws_ec2.ISubnet[],
        securityGroupSourceCidr1: string,
        role: Role,
        props: StackProps
    ) {
        super(scope, id, props);

        /*
         * Create a security group for a bastion host.
         */
        const ec2SecurityGroup = new aws_ec2.SecurityGroup(
            this,
            `${id}-EC2-SecurityGroup`,
            {
                vpc,
                allowAllOutbound: true,
                description: 'Security group for a EC2 host',
            }
        );
        ec2SecurityGroup.addIngressRule(
            aws_ec2.Peer.ipv4(securityGroupSourceCidr1),
            aws_ec2.Port.allIcmp(),
            "Allow all ICMP traffic from the specified CIDR"
        );
        ec2SecurityGroup.addIngressRule(
            aws_ec2.Peer.ipv4(securityGroupSourceCidr1),
            aws_ec2.Port.tcp(53),
            "Allow TCP 53 (Route 53) traffic from the specified CIDR"
        );
        ec2SecurityGroup.addIngressRule(
            aws_ec2.Peer.ipv4(securityGroupSourceCidr1),
            aws_ec2.Port.udp(53),
            "Allow UDP 53 (Route 53) traffic from the specified CIDR"
        );

        /*
         * Create the bastion host.
         */
        const ec2Instance = new aws_ec2.Instance(
            this,
            `${id}-${props?.env?.region}-EC2Instance`,
            {
                instanceName: `${id}-EC2-Instance`,
                vpc: vpc,
                vpcSubnets: {
                    subnets: [
                        privateSubnets[0]
                    ]
                },
                role: role,
                securityGroup: ec2SecurityGroup,
                instanceType: aws_ec2.InstanceType.of(
                    aws_ec2.InstanceClass.M5,
                    aws_ec2.InstanceSize.XLARGE,
                ),
                machineImage: new aws_ec2.AmazonLinuxImage(
                    {
                        generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
                    }
                ),
            }
        );

        /**
         * Outputs
         */
        new cdk.CfnOutput(
            this,
            `${id}-EC2-Instance-PrivateIp`, {
                value: ec2Instance.instancePrivateIp
            }
        );

    }
}
