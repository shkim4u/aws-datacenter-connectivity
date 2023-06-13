import {Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {CfnInclude} from "aws-cdk-lib/cloudformation-include";
import {ISubnet, Vpc} from "aws-cdk-lib/aws-ec2";


export class RdsLegacyStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    vpc: Vpc,
    subnets: ISubnet[],
    props: StackProps
  ) {
    super(scope, id, props);

    /*
     * Import RDS stack for legacy TravelBuddy application.
     */
    // const subnetIds = subnets.map(item => item.subnetId);

    const cfnRdsLegacyTemplate = new CfnInclude(
      this,
      `${id}-CfnTemplate`,
      {
        templateFile: "../prepare/rds.template",
        parameters: {
          'VpcId': vpc.vpcId,
          // PrivateSubnetIds: [
          //   subnets[0].subnetId,
          //   subnets[1].subnetId
          // ]
          PrivateSubnetIds: subnets.map(item => item.subnetId)
        }
      }
    );
  }
}
