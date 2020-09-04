import { ServiceClientCredentials, TokenCredentials } from "ms-rest";
import { RemoteServiceUrlHelper, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { ProvisioningServiceClient } from "./ProvisioningServiceClient";

export class ProvisioningServiceClientFactory {

    private static client: IProvisioningServiceClient;
    public static async getClient(credentials?: ServiceClientCredentials, githubPatToken?: string): Promise<IProvisioningServiceClient> {
        if (!!this.client) {
            return this.client;
        }

        const serviceDefinition = await RemoteServiceUrlHelper.getProvisioningServiceDefinition();
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
            this.client = new ProvisioningServiceClient(serviceDefinition.serviceUrl, credentials);
        } else {
            this.client = new ProvisioningServiceClient(serviceDefinition.serviceUrl, new TokenCredentials(githubPatToken, "token"));
        }
        
        return this.client;
    }
}
