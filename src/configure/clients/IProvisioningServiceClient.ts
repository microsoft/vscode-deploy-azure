import { ProvisioningConfiguration } from "../model/provisioningConfiguration";

export interface IProvisioningServiceClient {
    createProvisioningConfiguration(provisioningConfiguration: ProvisioningConfiguration, githubOrg: string, repositoryId: string, queryParameters?: { [propertyName: string]: string } ): Promise<ProvisioningConfiguration>;
    getProvisioningConfiguration(jobId: string, githubOrg: string, repositoryId: string, queryParameters?: { [propertyName: string]: string }): Promise<ProvisioningConfiguration>;
}
