export class InfrastructureProperties {
  readonly stackNamePrefix: string;
  readonly forAWS: boolean;
  readonly vpcCidrs?: string[];
  readonly publicSubnetCidrsAZa?: string[];
  readonly publicSubnetCidrsAZb?: string[];
  readonly publicSubnetCidrsAZc?: string[];
  readonly privateSubnetCidrsAZa?: string[];
  readonly privateSubnetCidrsAZb?: string[];
  readonly privateSubnetCidrsAZc?: string[];
  readonly eksClusterAdminIamUser?: string;
  readonly eksClusterAdminIamRole?: string;
}
