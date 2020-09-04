import { ProvisioningConfiguration } from "../model/provisioningConfiguration";

export interface IProvisioningServiceClient {
    createProvisioningConfiguration(provisioningConfiguration: ProvisioningConfiguration, relativeUrl: string): Promise<ProvisioningConfiguration>;
    getProvisioningConfiguration(relativeUrl: string): Promise<ProvisioningConfiguration>;
}
