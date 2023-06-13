import * as cdk from 'aws-cdk-lib';
import {aws_ec2, Stack, StackProps} from 'aws-cdk-lib';
import {CfnEIP, CfnNatGateway, CfnRoute, CfnTransitGateway, ISubnet} from "aws-cdk-lib/aws-ec2";
import {Construct} from "constructs";
import {InfrastructureProperties} from "../bin/infrastructure-properties";

export class NetworkStack extends Stack {
    readonly vpc: aws_ec2.Vpc;
    readonly publicSubnets: ISubnet[];
    readonly privateSubnets: ISubnet[];
    readonly allSubnets: ISubnet[];

    constructor(
        scope: Construct,
        id: string,
        infraProps: InfrastructureProperties,
        tgw: CfnTransitGateway,
        vpcCidr?: string,
        publicSubnetCidrAZa?: string,
        publicSubnetCidrAZc?: string,
        privateSubnetCidrAZa?: string,
        privateSubnetCidrAZc?: string,
        props?: StackProps
    ) {
        super(scope, id, props);

        this.vpc = new aws_ec2.Vpc(
            this,
            `${id}-VPC`,
            {
                // cidr: networkInformation.vpcCidr,  // Deprecated.
                ipAddresses: aws_ec2.IpAddresses.cidr(vpcCidr ?? "10.0.0.0/16"),
                maxAzs: 3,
                subnetConfiguration: []
            }
        );

        const igw = new aws_ec2.CfnInternetGateway(
            this,
            `${id}-IGW`,
            {}
        );
        const igwAttachment = new aws_ec2.CfnVPCGatewayAttachment(
            this,
            `${id}-VPCGWA`,
            {
                vpcId: this.vpc.vpcId,
                internetGatewayId: igw.ref
            }
        );
        const publicSubnetA = new aws_ec2.PublicSubnet(
            this,
            `${id}-PublicSubnet-a`,
            {
                availabilityZone: `${props?.env?.region}a`,
                cidrBlock: publicSubnetCidrAZa ?? "10.0.0.0/24",
                vpcId: this.vpc.vpcId,
                mapPublicIpOnLaunch: true,
            }
        );
        publicSubnetA.addDefaultInternetRoute(igw.ref, igwAttachment);

        const publicSubnetC = new aws_ec2.PublicSubnet(
            this,
            `${id}-PublicSubnet-c`,
            {
                availabilityZone: `${props?.env?.region}c`,
                cidrBlock: publicSubnetCidrAZc ?? "10.0.2.0/24",
                vpcId: this.vpc.vpcId,
                mapPublicIpOnLaunch: true
            }
        );
        publicSubnetC.addDefaultInternetRoute(igw.ref, igwAttachment);

        // Create a NAT gateway in this public subnet-a.
        const ngwA = new CfnNatGateway(
            this,
            `${id}-NATGateway-a`,
            {
                subnetId: publicSubnetA.subnetId,
                allocationId: new CfnEIP(
                    this,
                    `${id}-NATGatewayEIP-a`,
                    {
                        domain: 'vpc'
                    }
                ).attrAllocationId,
            }
        );

        // Create another NAT gateway in this public subnet-c.
        // [2023-06-12] Only one NAT per VPC to avoid limit.
        // const ngwC = new CfnNatGateway(
        //     this,
        //     `${id}-NATGateway-c`,
        //     {
        //         subnetId: publicSubnetC.subnetId,
        //         allocationId: new CfnEIP(
        //             this,
        //             `${id}-NATGatewayEIP-c`,
        //             {
        //                 domain: 'vpc'
        //             }
        //         ).attrAllocationId,
        //     }
        // );

        console.log(`Region: ${props?.env?.region}`);

        // Private subnet 1 on AZ-a.
        const privateSubnetA = new aws_ec2.PrivateSubnet(
            this,
            `${id}-PrivateSubnet-a`,
            {
                availabilityZone: `${props?.env?.region}a`,
                cidrBlock: privateSubnetCidrAZa ?? "10.0.3.0/24",
                vpcId: this.vpc.vpcId,
                mapPublicIpOnLaunch: false
            }
        );

        // Private subnet 2 on AZ-c.
        const privateSubnetC = new aws_ec2.PrivateSubnet(
            this,
            `${id}-PrivateSubnet-c`,
            {
                availabilityZone: `${props?.env?.region}c`,
                cidrBlock: privateSubnetCidrAZc ?? "10.0.5.0/24",
                vpcId: this.vpc.vpcId,
                mapPublicIpOnLaunch: false
            }
        );

        this.publicSubnets = [publicSubnetA, publicSubnetC];
        this.privateSubnets = [privateSubnetA, privateSubnetC];
        this.allSubnets = this.publicSubnets.concat(this.privateSubnets);

        // // const privateRoute = new CfnRoute(
        // //     this,
        // //     `${id}-Private-Route-NATGW`,
        // //     {
        // //         destinationCidrBlock: '0.0.0.0/0',
        // //         routeTableId: routeTableId,
        // //         // natGatewayId: (index == 0 ? ngwA.ref : ngwC.ref)
        // //         natGatewayId: ngwA.ref
        // //     }
        // // );
        // // this.privateSubnets.forEach(
        // //     ({routeTable: {routeTableId}}, index) => {
        // //         privateRoute
        // //     }
        // // );
        //
        // // Attach route table for each public subnets.
        // this.publicSubnets.forEach(
        //     ({routeTable: {routeTableId}}, index) => {
        //         new CfnRoute(
        //             this,
        //             `${id}-Public-Route-TGW-${index}`,
        //             {
        //                 destinationCidrBlock: '10.0.0.0/8',
        //                 routeTableId: routeTableId,
        //                 transitGatewayId: tgw.attrId
        //             }
        //         );
        //     }
        // );
        //
        // Attach route table for each private subnets.
        this.privateSubnets.forEach(
            ({routeTable: {routeTableId}}, index) => {
                new CfnRoute(
                    this,
                    `${id}-Private-Route-NATGW-${index}`,
                    {
                        destinationCidrBlock: '0.0.0.0/0',
                        routeTableId: routeTableId,
                        // natGatewayId: (index == 0 ? ngwA.ref : ngwC.ref)
                        natGatewayId: ngwA.ref
                    }
                );
            }
        );
        // this.privateSubnets.forEach(
        //     ({routeTable: {routeTableId}}, index) => {
        //         new CfnRoute(
        //             this,
        //             `${id}-Private-Route-TGW-${index}`,
        //             {
        //                 destinationCidrBlock: '10.0.0.0/8',
        //                 routeTableId: routeTableId,
        //                 transitGatewayId: tgw.attrId
        //             }
        //         );
        //     }
        // );


        // Define arrow function that tags subnets.
        const tagAllSubnets = (
            subnets: aws_ec2.ISubnet[],
            tagName: string,
            tagValue: string,
        ) => {
            for (const subnet of subnets) {
                cdk.Tags.of(subnet).add(
                    tagName,
                    `${tagValue}`,
                );
            }
        };
        /*
         * Tag target private subnets to hold necessary tag values.
         * - Key: kubernetes.io/role/internal-elb
         * - Value: 1
         * https://aws.amazon.com/ko/premiumsupport/knowledge-center/eks-vpc-subnet-discovery/
         */
        tagAllSubnets(this.privateSubnets, 'kubernetes.io/role/internal-elb', '1');

        /**
         * Fix missing tag for public subnet.
         * (Note) This is for ALB/NLB attached to the public subnet in the past and backward compatibility.
         */
        cdk.Tags.of(publicSubnetA).add(
            'kubernetes.io/role/elb', '1'
        );
        cdk.Tags.of(publicSubnetA).add(
            'aws-cdk:subnet-type',
            'Public'
        );
        cdk.Tags.of(publicSubnetC).add(
            'kubernetes.io/role/elb', '1'
        );
        cdk.Tags.of(publicSubnetC).add(
            'aws-cdk:subnet-type',
            'Public'
        );
        // Print outputs.
        // Stack
        new cdk.CfnOutput(
            this,
            `${id}-StackId`, {
                value: this.stackId
            });

        new cdk.CfnOutput(
            this,
            `${id}-StackName`, {
                value: this.stackName
            });

        // VPC ID.
        new cdk.CfnOutput(
            this,
            `${id}-VPCId`, {
                value: this.vpc.vpcId
            }
        );
        // VPC.
        new cdk.CfnOutput(
            this,
            `${id}-VPCCidr`, {
                // exportName: "M2MNetworkStackVPCCidr",
                exportName: `${id}-NetworkStack-Vpc-Cidr`,
                value: this.vpc.vpcCidrBlock
            }
        );

        // Subnets.
        this.publicSubnets.forEach(
            (subnet, index) => {
                new cdk.CfnOutput(
                    this,
                    `${id}-PublicSubnet-${index}`, {
                        value: subnet.ipv4CidrBlock
                    }
                )
            }
        );
        this.privateSubnets.forEach(
            (subnet, index) => {
                new cdk.CfnOutput(
                    this,
                    `${id}-PrivateSubnet-${index}`, {
                        value: subnet.ipv4CidrBlock
                    }
                )
            }
        );
    }

}
