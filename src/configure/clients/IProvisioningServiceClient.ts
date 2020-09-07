import { ProvisioningConfiguration } from "../model/provisioningConfiguration";

export interface IProvisioningServiceClient {
    createProvisioningConfiguration(provisioningConfiguration: ProvisioningConfiguration, githubOrg: string, repositoryId: string): Promise<ProvisioningConfiguration>;
    getProvisioningConfiguration(jobId: string, githubOrg: string, repositoryId: string): Promise<ProvisioningConfiguration>;
}
