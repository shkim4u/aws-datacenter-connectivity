import {aws_ec2, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {InfrastructureProperties} from "../bin/infrastructure-properties";
import {CfnRoute, ISubnet, IVpc} from "aws-cdk-lib/aws-ec2";

export class TgwAttachmentStack extends Stack {

    constructor(
        scope: Construct,
        id: string,
        infraProps: InfrastructureProperties,
        tgw: aws_ec2.CfnTransitGateway,
        vpc: IVpc,
        publicSubnets: ISubnet[],
        privateSubnets: ISubnet[],
        props?: StackProps
    ) {
        super(scope, id, props);

        // Create TGW attachment.
        // Attach VPCs to the TGW.
        const tgwAttachment = new aws_ec2.CfnTransitGatewayAttachment(
            this,
            `${id}-TGW-Attachment`,
            {
                transitGatewayId: tgw.ref,
                vpcId: vpc.vpcId,
                subnetIds: [privateSubnets[0].subnetId, privateSubnets[1].subnetId],
                tags: [{
                    key: 'Name',
                    value: `${id}-TGW-Attachment`
                }],
            }
        );
        tgwAttachment.addDependency(tgw);

        // Attach route table for each public subnets.
        publicSubnets.forEach(
            ({routeTable: {routeTableId}}, index) => {
                new CfnRoute(
                    this,
                    `${id}-Public-Route-TGW-${index}`,
                    {
                        destinationCidrBlock: '10.0.0.0/8',
                        routeTableId: routeTableId,
                        transitGatewayId: tgw.ref
                    }
                ).addDependency(tgwAttachment);
            }
        );

        // Attach route table for each private subnets.
        privateSubnets.forEach(
            ({routeTable: {routeTableId}}, index) => {
                new CfnRoute(
                    this,
                    `${id}-Private-Route-TGW-${index}`,
                    {
                        destinationCidrBlock: '10.0.0.0/8',
                        routeTableId: routeTableId,
                        transitGatewayId: tgw.ref
                    }
                ).addDependency(tgwAttachment);
            }
        );

    }

}
