import { ServiceClientCredentials, TokenCredentials } from "ms-rest";
import { RemoteServiceUrlHelper, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { TemplateServiceClient } from "./github/TemplateServiceClient";
import { ITemplateServiceClient } from "./ITemplateServiceClient";
const UserAgent = "deploy-to-azure-vscode";

export class TemplateServiceClientFactory {

    private static client: ITemplateServiceClient;
    public static async getClient(credentials?: ServiceClientCredentials, githubPatToken?: string): Promise<ITemplateServiceClient> {
        if (!!this.client) {
            return this.client;
        }
        const serviceDefinition = await RemoteServiceUrlHelper.getTemplateServiceDefinition();
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
            this.client = new TemplateServiceClient(serviceDefinition.serviceUrl, credentials);
        } else {
            this.client = new TemplateServiceClient(serviceDefinition.serviceUrl, new TokenCredentials(githubPatToken, "token"), {
                "User-Agent": UserAgent,
                "Content-Type": "application/json; charset=utf-8"
            });
        }
        return this.client;
    }
}
