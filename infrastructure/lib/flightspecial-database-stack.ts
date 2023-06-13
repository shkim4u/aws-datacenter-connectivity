import {aws_ec2, Duration, RemovalPolicy, Stack, StackProps} from "aws-cdk-lib";
import {InstanceClass, InstanceSize, InstanceType, ISubnet, IVpc} from "aws-cdk-lib/aws-ec2";
import {Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion} from "aws-cdk-lib/aws-rds";
import {Construct} from "constructs";
import {deployEnv, isProductionDeployEnv, KnownDeployEnv, projectEnvSpecificName} from "./env-utils";
import * as cdk from "aws-cdk-lib";

export class FlightSpecialDatabaseStack extends Stack {
    static readonly databasePort = 5432;
    static readonly databaseName = `dso`;

    readonly databaseInstance: DatabaseInstance;

    constructor(
        scope: Construct,
        id: string,
        vpc: IVpc,
        privateSubnets: ISubnet[],
        props: StackProps,
    ) {
        super(scope, id, props);

        /*
         * Basic information.
         */
        const databaseUserName = "postgres";
        // const databasePassword = "P@ssw0rd";
        const databaseCredentialSecretName = `flightspecial_db_credentials_${deployEnv()}`;

        const databaseCredentials = Credentials.fromGeneratedSecret(
            databaseUserName,
            {
                secretName: databaseCredentialSecretName
            }
        );

        /*
         * Security group.
         */
        const databaseSecurityGroup = new aws_ec2.SecurityGroup(
            this,
            `${id}-FlightSpecial-Database-SecurityGroup`,
            {
                vpc,
                allowAllOutbound: true,
                description: 'Security group for a bastion host',
            }
        );
        databaseSecurityGroup.addIngressRule(
            aws_ec2.Peer.ipv4(vpc.vpcCidrBlock),
            aws_ec2.Port.allTraffic(),
            'Allow all traffic from inside VPC'
        );


        this.databaseInstance = new DatabaseInstance(
            this,
            projectEnvSpecificName('postgres-db'),
            {
                databaseName: FlightSpecialDatabaseStack.databaseName,
                engine: DatabaseInstanceEngine.postgres({version: PostgresEngineVersion.VER_14_7}),
                instanceType: InstanceType.of(InstanceClass.M5, InstanceSize.XLARGE),
                instanceIdentifier: projectEnvSpecificName('postgres-db'),
                credentials: databaseCredentials,
                port: FlightSpecialDatabaseStack.databasePort,
                maxAllocatedStorage: 200,
                vpc,
                vpcSubnets: {
                    subnets: privateSubnets
                },
                deletionProtection: deployEnv() == KnownDeployEnv.prod,
                removalPolicy: removalPolicyAppropriateForEnv(),
                backupRetention: databaseBackupRetentionDaysForEnv(),
                copyTagsToSnapshot: true,
                iamAuthentication: true,
                securityGroups: [databaseSecurityGroup]
            }
        );

        /**
         * Outputs
         */
        new cdk.CfnOutput(
            this,
            `${id}-FlightSpecial-DB-Endpoint`, {
                value: this.databaseInstance.dbInstanceEndpointAddress
            }
        );
        new cdk.CfnOutput(
            this,
            `${id}-FlightSpecial-DB-Port`, {
                value: this.databaseInstance.dbInstanceEndpointPort
            }
        );

        /*
         * Secret 값을 얻는 방법 참조
         * - https://bobbyhadz.com/blog/get-secrets-manager-values-aws-cdk
         * - https://blog.makerx.com.au/pattern-secure-aws-secret-handling-with-typescript-cdk/
         */
        // new cdk.CfnOutput(
        //     this,
        //     `${id}-FlightSpecial-DB-User`, {
        //         value: Secret.fromSecretNameV2(this.databaseInstance.secret!, "username")
        //     }
        // );
        // new cdk.CfnOutput(
        //     this,
        //     `${id}-FlightSpecial-DB-Password`, {
        //         value: Secret.fromSecretsManager(this.databaseInstance.secret!, "password")
        //     }
        // );
    }
}

export function removalPolicyAppropriateForEnv() {
    return isProductionDeployEnv() ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
}

export function databaseBackupRetentionDaysForEnv() {
    return isProductionDeployEnv() ? Duration.days(14) : Duration.days(1)
}

