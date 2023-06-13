import * as cdk from 'aws-cdk-lib';
import {aws_ssm, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";

export class SsmStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const travelbuddyImageTag = new aws_ssm.StringParameter(
            this,
            `${id}-${props?.env?.region}-SsmParam-TravelBuddy`,
            {
                parameterName: '/application/travelbuddy/container/image/main/tag',
                stringValue: 'default',    // Initially with 'default'.
                description: 'TravelBuddy application main branch image tag',
                // type: ssm.ParameterType.STRING,
                tier: aws_ssm.ParameterTier.STANDARD
            }
        );

        // Print.
        new cdk.CfnOutput(
            this,
            `TravelBuddy Container Image Tag Param`, {
                value: travelbuddyImageTag.parameterName
            }
        );
        new cdk.CfnOutput(
            this,
            `TravelBuddy Container Image Tag Value`, {
                value: travelbuddyImageTag.stringValue
            }
        );

        const fligspecialsSsmConfig = new aws_ssm.StringParameter(
            this,
            `${id}-${props?.env?.region}-SsmParam-FlightSpecials`,
            {
                parameterName: '/config/flightspecials_cloud-property',
                stringValue: 'default',     // Initially with 'default'
                description: 'FlightSpecials application sample config by ParameterStore',
                tier: aws_ssm.ParameterTier.STANDARD
            }
        );
        new cdk.CfnOutput(
            this,
            `FlightSpecials Config by ParamStore`, {
                value: fligspecialsSsmConfig.stringValue
            }
        );
    }
}
