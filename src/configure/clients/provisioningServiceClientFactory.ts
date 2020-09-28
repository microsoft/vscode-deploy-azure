import { ServiceClientCredentials, TokenCredentials } from "ms-rest";
import { RemoteServiceUrlHelper, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { ProvisioningServiceClient } from "./ProvisioningServiceClient";

export class ProvisioningServiceClientFactory {
    public static async getClient(githubPatToken: string, credentials?: ServiceClientCredentials ): Promise<IProvisioningServiceClient> {
        if (!!this.client) {
            return this.client;
        }

        const defaultHeaders: { [propertyName: string]: string } =   { "Content-Type": "application/json" };
        const serviceDefinition = await RemoteServiceUrlHelper.getProvisioningServiceDefinition();
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
            defaultHeaders["X-GITHUB-TOKEN"] = "token " + githubPatToken;
            this.client = new ProvisioningServiceClient(serviceDefinition, defaultHeaders, credentials);
        } else {
            this.client = new ProvisioningServiceClient(serviceDefinition, defaultHeaders, new TokenCredentials(githubPatToken, "token"));
        }

        return this.client;
    }

    private static client: IProvisioningServiceClient;
}
