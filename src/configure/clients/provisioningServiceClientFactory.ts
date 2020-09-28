import { ServiceClientCredentials, TokenCredentials } from "ms-rest";
import { RemoteServiceUrlHelper, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { ProvisioningServiceClient } from "./ProvisioningServiceClient";

export class ProvisioningServiceClientFactory {
    public static async getClient(githubPatToken: string, credentials?: ServiceClientCredentials): Promise<IProvisioningServiceClient> {
        if (!!this.client) {
            return this.client;
        }
        const defaultHeaders: { [propertyName: string]: string } =   { "Content-Type": "application/json" };	        const defaultHeaders: { [propertyName: string]: string } = { "Content-Type": "application/json" };
        const serviceDefinition = await RemoteServiceUrlHelper.getProvisioningServiceDefinition();	        const serviceDefinition = await RemoteServiceUrlHelper.getProvisioningServiceDefinition();
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {	        serviceDefinition.serviceUrl = "http://localhost:9090/repos/";
            defaultHeaders["X-GITHUB-TOKEN"] = "token " + githubPatToken;	        serviceDefinition.serviceFramework = ServiceFramework.Moda;
            this.client = new ProvisioningServiceClient(serviceDefinition, defaultHeaders, credentials);	        this.client = new ProvisioningServiceClient(serviceDefinition, defaultHeaders, new TokenCredentials(githubPatToken, "token"));
        } else {	
            this.client = new ProvisioningServiceClient(serviceDefinition, defaultHeaders, new TokenCredentials(githubPatToken, "token"));	
        }

        return this.client;
    }

    private static client: IProvisioningServiceClient;
}
