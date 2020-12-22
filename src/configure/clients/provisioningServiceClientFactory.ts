import { ServiceClientCredentials, TokenCredentials } from "ms-rest";
import { RemoteServiceUrlHelper, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { Messages } from '../resources/messages';
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { ProvisioningServiceClient } from "./ProvisioningServiceClient";


export class ProvisioningServiceClientFactory {
    public static async getClient(): Promise<IProvisioningServiceClient> {
        if (!!this.client) {
            return this.client;
        }

        if (!this.githubPatToken || !this.credentials) {
            throw new Error(Messages.UndefinedClientCredentials);
        }

        const defaultHeaders: { [propertyName: string]: string } = { "Content-Type": "application/json" };
        const serviceDefinition = await RemoteServiceUrlHelper.getProvisioningServiceDefinition();
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
            defaultHeaders["X-GITHUB-TOKEN"] = "token " + this.githubPatToken;
            this.client = new ProvisioningServiceClient(serviceDefinition, defaultHeaders, this.credentials);
        } else {
            this.client = new ProvisioningServiceClient(serviceDefinition, defaultHeaders, new TokenCredentials(this.githubPatToken, "token"));
        }

        return this.client;
    }

    public static setClientCredentials(credentials: ServiceClientCredentials, githubPatToken: string): void {
        this.client = null;
        this.credentials = credentials;
        this.githubPatToken = githubPatToken
    }

    private static client: IProvisioningServiceClient;
    private static credentials: ServiceClientCredentials;
    private static githubPatToken: string;
}
