export const AWS_VPC_CIDRS = ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"];
export const AWS_PUBLIC_SUBNET_CIDRS_AZa = ["10.0.0.0/24", "10.1.0.0/24", "10.2.0.0/24"];
export const AWS_PUBLIC_SUBNET_CIDRS_AZb = ["10.0.1.0/24", "10.1.1.0/24", "10.2.1.0/24"];
export const AWS_PUBLIC_SUBNET_CIDRS_AZc = ["10.0.2.0/24", "10.1.2.0/24", "10.2.2.0/24"];
export const AWS_PRIVATE_SUBNET_CIDRS_AZa = ["10.0.3.0/24", "10.1.3.0/24", "10.2.3.0/24"];
export const AWS_PRIVATE_SUBNET_CIDRS_AZb = ["10.0.4.0/24", "10.1.4.0/24", "10.2.4.0/24"];
export const AWS_PRIVATE_SUBNET_CIDRS_AZc = ["10.0.5.0/24", "10.1.5.0/24", "10.2.5.0/24"];

export const DC_VPC_CIDRS = ["10.10.0.0/16"];
export const DC_PUBLIC_SUBNET_CIDRS_AZa = ["10.10.0.0/24"];
export const DC_PUBLIC_SUBNET_CIDRS_AZb = ["10.10.1.0/24"];
export const DC_PUBLIC_SUBNET_CIDRS_AZc = ["10.10.2.0/24"];
export const DC_PRIVATE_SUBNET_CIDRS_AZa = ["10.10.3.0/24"];
export const DC_PRIVATE_SUBNET_CIDRS_AZb = ["10.10.4.0/24"];
export const DC_PRIVATE_SUBNET_CIDRS_AZc = ["10.10.5.0/24"];


const DEPLOY_ENV: DeployEnv = process.env.DEPLOY_ENV || 'test';

export enum KnownDeployEnv {
    prod = 'prod',
    stage = 'stage',
    test = 'test'
}

export function deployEnv(): DeployEnv {
    return DEPLOY_ENV;
}

export type DeployEnv = KnownDeployEnv | string

export const PROJECT_NAME = "flightspecials";

export function projectEnvSpecificName(name: string = ""): string {
    const prefix = PROJECT_NAME.replace('_', '-') + "-" + DEPLOY_ENV;
    if (name.startsWith(prefix)) {
        return name
    } else {
        return `${prefix}-${name}`
    }
}

export function isProductionDeployEnv() {
    return deployEnv() == KnownDeployEnv.prod
}
