import * as cdk from 'aws-cdk-lib';
import {
  aws_codebuild,
  aws_codecommit, aws_codepipeline, aws_codepipeline_actions,
  aws_ecr,
  aws_eks,
  aws_iam,
  aws_s3,
  Environment,
  NestedStack,
  NestedStackProps, Stack
} from "aws-cdk-lib";
import {Construct} from "constructs";

interface DeployStackProps extends NestedStackProps {
  ecrRepository: aws_ecr.Repository
  eksCluster: aws_eks.Cluster,
  eksDeployRole: aws_iam.Role,
  readonly env?: Environment
}

export class DeployStack extends NestedStack {
  // CodeCommit repository for deployspec.yml and some several Kubernetes template files.
  readonly deploySourceRepository: aws_codecommit.Repository;

  constructor(
    scope: Construct,
    id: string,
    deployProps: DeployStackProps,
  ) {
    super(scope, id, deployProps);

    this.deploySourceRepository = new aws_codecommit.Repository(
      this,
      `${id}-DeploySourceRepository`,
      {
        repositoryName: `${id}-DeploySourceRepository`
      }
    );

    // CodeBuild role.
    const deployBuildRole = new aws_iam.Role(
      this,
      `${id}-${deployProps?.env?.region}-DeployBuildIamRole`,
      {
        assumedBy: new aws_iam.ServicePrincipal('codebuild.amazonaws.com')
      }
    );
    deployBuildRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"));

    const region: string = Stack.of(this).region;
    const account: string = Stack.of(this).account;
    let bucketName = `${id}-deploy-${region}-${account}`.substr(0, 63).toLowerCase();
    const deployCodebuildBucket = new aws_s3.Bucket(
      this,
      `${id}-Bucket`,
      {
        bucketName: bucketName,
        removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
      }
    );

    deployCodebuildBucket.grantPut(deployBuildRole);
    deployCodebuildBucket.grantRead(deployBuildRole);
    deployCodebuildBucket.grantReadWrite(deployBuildRole);
    deployCodebuildBucket.grantWrite(deployBuildRole);

    const deployPipeline = new aws_codepipeline.Pipeline(
      this,
      `${id}-DeployPipeline`,
      {
        pipelineName: `${id}-DeployPipeline`
      }
    );

    // ECR Source Action.
    const sourceEcrOutput = new aws_codepipeline.Artifact();
    const sourceEcrAction = new aws_codepipeline_actions.EcrSourceAction(
      {
        actionName: 'Pull_Image_Action',
        // repository: buildAndDeliveryStack.ecrRepository,
        repository: deployProps.ecrRepository,
        imageTag: 'latest',
        output: sourceEcrOutput
      }
    );

    const deploySourceCodeCommitOutput = new aws_codepipeline.Artifact();
    const deploySourceCodeCommitAction = new aws_codepipeline_actions.CodeCommitSourceAction(
      {
        actionName: 'Pull_Deploy_Source_Code_Action',
        repository: this.deploySourceRepository,
        branch: 'main',
        output: deploySourceCodeCommitOutput
      }
    );

    // CodeCommit source action that contains deployspce.yml holding kubernetes manifest file.
    deployPipeline.addStage(
      {
        stageName: 'ECR_Source_Stage',
        actions: [sourceEcrAction, deploySourceCodeCommitAction]
      }
    );

    /**
     * CodeBuild to deploy the container image to EKS cluster.
     * The custom build image used here is installed with kubectl and some other tools to manipulate Kubernetes cluster.
     */
    const deployProject = new aws_codebuild.PipelineProject(
      this,
      `${id}-DeployProject`,
      {
        role:deployBuildRole,
        cache: aws_codebuild.Cache.local(aws_codebuild.LocalCacheMode.DOCKER_LAYER),
        environment: {
          buildImage: aws_codebuild.LinuxBuildImage.STANDARD_5_0,
          computeType: aws_codebuild.ComputeType.LARGE,
          privileged: true
        },
        description: "Deploy project created by CDK.",
        environmentVariables: {
          'CLUSTER_NAME': {
            value: deployProps.eksCluster.clusterName
          },
          'ECR_REPO_URI': {
            value: deployProps.ecrRepository.repositoryUri
          },
          'ASSUME_ROLE_ARN': {
            value: deployProps.eksDeployRole.roleArn
          }
        },
        buildSpec: aws_codebuild.BuildSpec.fromSourceFilename('deployspec.yml')
      }
    );

    const deployOutput = new aws_codepipeline.Artifact();
    const deployAction = new aws_codepipeline_actions.CodeBuildAction(
      {
        actionName: "Deploy_Action",
        project: deployProject,
        input: deploySourceCodeCommitOutput,
        extraInputs: [sourceEcrOutput],
        outputs: [deployOutput]
      }
    );
    deployPipeline.addStage(
      {
        stageName: "Deploy_Stage",
        actions: [deployAction]
      }
    );

    // Print output.
    new cdk.CfnOutput(
      this,
      `${id}-DeployStackId`,
      {
        value: this.stackId
      }
    );
    new cdk.CfnOutput(
      this,
      `${id}-DeployStackName`,
      {
        value: this.stackName
      }
    );

    // CodeCommit.
    new cdk.CfnOutput(
      this,
      `${id}-DeployCodeCommitRepositoryArn`,
      {
        value: this.deploySourceRepository.repositoryArn
      }
    );
    new cdk.CfnOutput(
      this,
      `${id}-DeployCodeCommitRepositoryUrl`,
      {
        value: this.deploySourceRepository.repositoryCloneUrlHttp
      }
    );
    new cdk.CfnOutput(
      this,
      `${id}-DeployCodeCommitRepositoryUrlGrc`,
      {
        value: this.deploySourceRepository.repositoryCloneUrlGrc
      }
    );

    // CodeBuild.
    new cdk.CfnOutput(
      this,
      `${id}-DeployCodeBuildProjectArn`, {
        value: deployProject.projectArn
      }
    );
    new cdk.CfnOutput(
      this,
      `${id}-DeployCodeBuildBucket`,
      { value: deployCodebuildBucket.bucketName }
    );

    // CodePipeline.
    new cdk.CfnOutput(
      this,
      `${id}-DeployCodePipelineArn`, {
        value: deployPipeline.pipelineArn
      }
    );
  }

}
