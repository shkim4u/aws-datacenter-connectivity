import * as cdk from 'aws-cdk-lib';
import {
  aws_codebuild,
  aws_codecommit,
  aws_codepipeline, aws_codepipeline_actions,
  aws_ecr,
  aws_eks,
  aws_iam,
  aws_s3,
  Stack,
  StackProps
} from "aws-cdk-lib";
import {Construct} from "constructs";
import {DeployStack} from "./deploy-stack";

export class BuildDeliveryStack extends Stack {

  readonly appSourceRepository: aws_codecommit.Repository;
  readonly ecrRepository: aws_ecr.Repository;

  deployStack: DeployStack;

  constructor(
    scope: Construct,
    id: string,
    eksCluster: aws_eks.Cluster,
    eksDeployRole: aws_iam.Role,
    props?: StackProps
  ) {
    super(scope, id, props);

    // ECR repository for later develop.
    this.ecrRepository = new aws_ecr.Repository(
      this,
      `${id}-ECRRepository`,
      {
        repositoryName: `${id}-Repository`.toLowerCase(),
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }
    );

    // ECR lifecycle.
    this.ecrRepository.addLifecycleRule(
      {
        // maxImageAge: cdk.Duration.days(30)
        maxImageCount: 30
      }
    );

    /**
     * CodeCommit repository to hold source code trigger the pipelines.
     */
    this.appSourceRepository = new aws_codecommit.Repository(
      this,
      `${id}-SourceRepository`,
      {
        repositoryName: `${id}-SourceRepository`
      }
    );

    // CodeBuild role.
    const buildRole = new aws_iam.Role(
      this,
      `${id}-${props?.env?.region}-CodeBuildIamRole`,
      {
        assumedBy: new aws_iam.ServicePrincipal('codebuild.amazonaws.com')
      }
    );
    buildRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AWSLambda_FullAccess"));		// Reserved.
    buildRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonAPIGatewayAdministrator"));
    buildRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"));
    buildRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeCommitPowerUser"));

    buildRole.addToPolicy(new aws_iam.PolicyStatement({resources: ['*'], actions: ['cloudformation:*']}));
    buildRole.addToPolicy(new aws_iam.PolicyStatement({resources: ['*'], actions: ['iam:*']}));
    buildRole.addToPolicy(new aws_iam.PolicyStatement({resources: ['*'], actions: ['ecr:GetAuthorizationToken']}));
    buildRole.addToPolicy(new aws_iam.PolicyStatement({resources: [`${this.ecrRepository.repositoryArn}*`], actions: ['ecr:*']}));

    /**
     * Add to access to ECR repository hosting Corretto 11, which is to prevent pull rate limit caused by Docker Hub.
     * This permission will be used in codebuild command as below.
     * "docker login --username AWS -p $(aws ecr get-login-password --region ap-northeast-2) 489478819445.dkr.ecr.ap-northeast-2.amazonaws.com",
     * "docker pull 489478819445.dkr.ecr.ap-northeast-2.amazonaws.com/amazoncorretto:11 || true"
     */
    buildRole.addToPolicy(new aws_iam.PolicyStatement({resources: [`*`], actions: ['ecr:*']}));

    /**
     * For MWAA (Managed Workflow for Apache Airflow)
     */
    buildRole.addToPolicy(new aws_iam.PolicyStatement({resources: ['*'], actions: ['airflow:CreateCliToken']}));

      // CodeBuild source.
    const sourceCodeCommit = aws_codebuild.Source.codeCommit({
      repository: this.appSourceRepository
    });

    const region: string = Stack.of(this).region;
    const account: string = Stack.of(this).account;
    let bucketName = `${id}-${region}-${account}`.substr(0, 63).toLowerCase();
    const buildAndDeliveryCodebuildBucket = new aws_s3.Bucket(
      this,
      `${id}-Bucket`, {
        bucketName: bucketName,
        // The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
        // the new bucket, and it will remain in your account until manually deleted. By setting the policy to
        // DESTROY, cdk destroy will attempt to delete the bucket, but will error if the bucket is not empty.

        removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
      }
    );

    buildAndDeliveryCodebuildBucket.grantPut(buildRole);
    buildAndDeliveryCodebuildBucket.grantRead(buildRole);
    buildAndDeliveryCodebuildBucket.grantReadWrite(buildRole);
    buildAndDeliveryCodebuildBucket.grantWrite(buildRole);

    /**
     * CodePipeline to trigger build.
     */
    const buildAndDeliveryPipeline = new aws_codepipeline.Pipeline(
      this,
      `${id}-BuildAndDeliveryPipeline`,
      {
        pipelineName: `${id}-BuildAndDeliveryPipeline`
      }
    );
    const sourceCodeCommitOutput = new aws_codepipeline.Artifact();
    const sourceCodeCommitAction = new aws_codepipeline_actions.CodeCommitSourceAction({
      actionName: 'Pull_Source_Code_Action',
      repository: this.appSourceRepository,
      branch: 'main',
      output: sourceCodeCommitOutput
    });

    // Add source stage to CodePipeline.
    buildAndDeliveryPipeline.addStage({
      stageName: 'Source_Stage',
      actions: [sourceCodeCommitAction]
    });

    /**
     * CodeBuild in CodePipeline.
     */
    const buildAndDeliveryProject = new aws_codebuild.PipelineProject(
      this,
      `${id}-BuildAndDeliveryProject`,
      {
        role: buildRole,
        cache: aws_codebuild.Cache.local(aws_codebuild.LocalCacheMode.DOCKER_LAYER),
        environment: {
          // buildImage: aws_codebuild.LinuxBuildImage.AMAZON_LINUX_2,
          buildImage: aws_codebuild.LinuxBuildImage.STANDARD_5_0,
          computeType: aws_codebuild.ComputeType.LARGE,
          privileged: true		// We need to build the Docker image.
        },
        environmentVariables: {
          'ECR_REPO_URI': {
            value: this.ecrRepository.repositoryUri
          }
        },
        description: "Build and delivery project created by CDK.",
        buildSpec: aws_codebuild.BuildSpec.fromSourceFilename('buildspec.yml')
      }
    );
    const buildAndDeliveryOutput = new aws_codepipeline.Artifact();
    const buildAndDeliveryAction = new aws_codepipeline_actions.CodeBuildAction(
      {
        actionName: "Build_And_Delivery_Action",
        project: buildAndDeliveryProject,
        input: sourceCodeCommitOutput,
        outputs: [buildAndDeliveryOutput]
      }
    );
    buildAndDeliveryPipeline.addStage(
      {
        stageName: "Build_And_Delivery_Stage",
        actions: [buildAndDeliveryAction]
      }
    );

    /**
     * Nested stack for deploy pipeline.
     */
    const ecrRepository = this.ecrRepository;
    this.deployStack = new DeployStack(
      this,
      `${id}-DeployStack`,
      {
        ecrRepository,
        eksCluster,
        eksDeployRole,
        env: props?.env
      },
    );

    // Print outputs.
    // Stack
    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryStackId`, {
        value: this.stackId
      }
    );

    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryStackName`, {
        value: this.stackName
      }
    );

    // CodeCommit.
    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryCodeCommitRepositoryArn`, {
        value: this.appSourceRepository.repositoryArn
      }
    );
    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryCodeCommitRepositoryUrl`, {
        exportName: `${id}-BuildAndDeliveryCodeCommitRepositoryUrl`,
        value: this.appSourceRepository.repositoryCloneUrlHttp
      }
    );
    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryCodeCommitRepositoryUrlGrc`, {
        exportName: `${id}-BuildAndDeliveryCodeCommitRepositoryUrlGrc`,
        value: this.appSourceRepository.repositoryCloneUrlGrc
      }
    );

    // CodeBuild.
    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryCodeBuildProjectArn`, {
        value: buildAndDeliveryProject.projectArn
      }
    );
    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryCodeBuildBucket`,
      { value: buildAndDeliveryCodebuildBucket.bucketName }
    );

    // CodePipeline.
    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryCodePipelineArn`, {
        value: buildAndDeliveryPipeline.pipelineArn
      }
    );

    // ECR.
    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryEcrName`, {
        value: this.ecrRepository.repositoryName
      }
    );

    new cdk.CfnOutput(
      this,
      `${id}-BuildAndDeliveryEcrArn`, {
        value: this.ecrRepository.repositoryArn
      }
    );
  }

}
