import {InfrastructureProperties} from "../bin/infrastructure-properties";
import {aws_ec2, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {CfnTransitGateway} from "aws-cdk-lib/aws-ec2";

export class TgwStack extends Stack {
    public readonly tgw: CfnTransitGateway;

    constructor(
        scope: Construct,
        id: string,
        infraProps: InfrastructureProperties,
        props?: StackProps
    ) {
        super(scope, id, props);

        // Create TGW.
        this.tgw = new aws_ec2.CfnTransitGateway(
            this,
            `${id}-TGW`,
            {
                dnsSupport: "enable",
                vpnEcmpSupport: "enable",
                defaultRouteTableAssociation: "enable",
                defaultRouteTablePropagation: "enable",
                description: "AWS Cloud Transit Gateway",
                tags: [{
                    key: "Name",
                    value: "AWS Cloud Transit Gateway"
                }]
            }
        );
    }
}
