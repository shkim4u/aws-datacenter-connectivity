#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {InfrastructureProperties} from "./infrastructure-properties";
import {NetworkStack} from "../lib/network-stack";
import {EksStack} from "../lib/eks-stack";
import {BuildDeliveryStack} from "../lib/build-delivery-stack";
import {SsmStack} from "../lib/ssm-stack";
import {IamStack} from "../lib/iam-stack";
import {Ec2Stack} from "../lib/ec2-stack";
import {RdsLegacyStack} from "../lib/rds-legacy-stack";
import * as net from "net";
import {FlightSpecialDatabaseStack} from "../lib/flightspecial-database-stack";
import {
    AWS_PRIVATE_SUBNET_CIDRS_AZa,
    AWS_PRIVATE_SUBNET_CIDRS_AZb,
    AWS_PRIVATE_SUBNET_CIDRS_AZc,
    AWS_PUBLIC_SUBNET_CIDRS_AZa,
    AWS_PUBLIC_SUBNET_CIDRS_AZb,
    AWS_PUBLIC_SUBNET_CIDRS_AZc,
    AWS_VPC_CIDRS,
    DC_PRIVATE_SUBNET_CIDRS_AZa,
    DC_PRIVATE_SUBNET_CIDRS_AZb,
    DC_PRIVATE_SUBNET_CIDRS_AZc,
    DC_PUBLIC_SUBNET_CIDRS_AZa,
    DC_PUBLIC_SUBNET_CIDRS_AZb,
    DC_PUBLIC_SUBNET_CIDRS_AZc,
    DC_VPC_CIDRS
} from "../lib/env-utils";
import {TgwStack} from "../lib/tgw-stack";
import {TgwAttachmentStack} from "../lib/tgw-attachment-stack";

const app = new cdk.App();

/**
 * CDK_INTEG_XXX are set when producing the environment-aware values and CDK_DEFAULT_XXX is passed in through from the CLI in actual deployment.
 */
const env = {
    region: app.node.tryGetContext('region') || process.env.CDK_INTEG_REGION || process.env.CDK_DEFAULT_REGION,
    account: app.node.tryGetContext('account') || process.env.CDK_INTEG_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
};

/**
 * Basic VPC info for EKS clusters.
 * (참고) 아래에서 반드시 EKS Admin User와 Admin Role을 자신의 환경에 맞게 설정한다.
 * (참고) 설정하지 않아도 EKS 클러스터 생성 후에도 kubectl로 접근할 수 있다. 방법은?
 */
const infraProps: InfrastructureProperties = {
    stackNamePrefix: "DC2AWS",
    forAWS: true,
};

/**
 * IAM stack.
 */
const iamStack = new IamStack(
    app,
    `${infraProps.stackNamePrefix}-IamStack`,
    infraProps,
    {
        env
    }
);


/**
 * Network stack.
 */
const vpcCidrs = infraProps.publicSubnetCidrsAZa ?? (infraProps.forAWS ? AWS_VPC_CIDRS : DC_VPC_CIDRS);
const publicSubnetCidrsAZa = infraProps.publicSubnetCidrsAZa ?? (infraProps.forAWS ? AWS_PUBLIC_SUBNET_CIDRS_AZa : DC_PUBLIC_SUBNET_CIDRS_AZa);
const publicSubnetCidrsAZb = infraProps.publicSubnetCidrsAZa ?? (infraProps.forAWS ? AWS_PUBLIC_SUBNET_CIDRS_AZb : DC_PUBLIC_SUBNET_CIDRS_AZb);
const publicSubnetCidrsAZc = infraProps.publicSubnetCidrsAZa ?? (infraProps.forAWS ? AWS_PUBLIC_SUBNET_CIDRS_AZc : DC_PUBLIC_SUBNET_CIDRS_AZc);
const privateSubnetCidrsAZa = infraProps.publicSubnetCidrsAZa ?? (infraProps.forAWS ? AWS_PRIVATE_SUBNET_CIDRS_AZa : DC_PRIVATE_SUBNET_CIDRS_AZa);
const privateSubnetCidrsAZb = infraProps.publicSubnetCidrsAZa ?? (infraProps.forAWS ? AWS_PRIVATE_SUBNET_CIDRS_AZb : DC_PRIVATE_SUBNET_CIDRS_AZb);
const privateSubnetCidrsAZc = infraProps.publicSubnetCidrsAZa ?? (infraProps.forAWS ? AWS_PRIVATE_SUBNET_CIDRS_AZc : DC_PRIVATE_SUBNET_CIDRS_AZc);

const tgwStack = new TgwStack(
    app,
    `${infraProps.stackNamePrefix}-TgwStack`,
    infraProps,
    {
        env
    }
);

const networkStacks = vpcCidrs.map((vpcCidr, idx) =>
    new NetworkStack(
        app,
        `${infraProps.stackNamePrefix}-NetworkStack-${idx}`,
        infraProps,
        tgwStack.tgw,
        vpcCidr,
        publicSubnetCidrsAZa[idx],
        publicSubnetCidrsAZc[idx],
        privateSubnetCidrsAZa[idx],
        privateSubnetCidrsAZc[idx],
        {
            env
        }
    )
);
networkStacks.forEach(networkStack => networkStack.addDependency(tgwStack));

// const tgwStack = new TgwStack(
//     app,
//     `${infraProps.stackNamePrefix}-TgwStack`,
//     infraProps,
//     {
//         env
//     }
// );
// networkStacks.map(networkStack => tgwStack.addDependency(networkStack));

const tgwAttachmentStacks = networkStacks.map(
    (networkStack, idx) => new TgwAttachmentStack(
        app,
        `${infraProps.stackNamePrefix}-TgwAttachmentStack-${idx}`,
        infraProps,
        tgwStack.tgw,
        networkStack.vpc,
        networkStack.publicSubnets,
        networkStack.privateSubnets,
        {env}
    )
);
tgwAttachmentStacks.forEach((item, idx) => item.addDependency(networkStacks[idx]));

/**
 * EC2 instances and some possible others.
 */
const ec2InstanceStacks = networkStacks.map(
    (networkStack, idx) => new Ec2Stack(
        app,
        `${infraProps.stackNamePrefix}-Ec2Stack-${idx}`,
        networkStack.vpc,
        networkStack.privateSubnets,
        "10.0.0.0/8",
        iamStack.adminRole,
        {
            env
        }
    )
);
ec2InstanceStacks.forEach((item, idx) => item.addDependency(networkStacks[idx]));

