import { ServiceClientCredentials, TokenCredentials } from "ms-rest";
import { RemoteServiceUrlHelper, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { ProvisioningServiceClient } from "./ProvisioningServiceClient";

export class ProvisioningServiceClientFactory {
    private static client: IProvisioningServiceClient;
    
    public static async getClient(githubPatToken: string, credentials?: ServiceClientCredentials ): Promise<IProvisioningServiceClient> {
        if (!!this.client) {
            return this.client;
        }

        const serviceDefinition = await RemoteServiceUrlHelper.getProvisioningServiceDefinition();
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
            this.client = new ProvisioningServiceClient(serviceDefinition.serviceUrl, githubPatToken, credentials);
        } else {
            this.client = new ProvisioningServiceClient(serviceDefinition.serviceUrl, githubPatToken, new TokenCredentials(githubPatToken, "token"));
        }
        
        return this.client;
    }
}
