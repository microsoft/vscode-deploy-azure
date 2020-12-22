import { ServiceClientCredentials, TokenCredentials } from "ms-rest";
import { RemoteServiceUrlHelper, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { Messages } from '../resources/messages';
import { TemplateServiceClient } from "./github/TemplateServiceClient";
import { ITemplateServiceClient } from "./ITemplateServiceClient";
const UserAgent = "deploy-to-azure-vscode";

export class TemplateServiceClientFactory {

    public static async getClient(): Promise<ITemplateServiceClient> {
        if (!!this.client) {
            return this.client;
        }

        const serviceDefinition = await RemoteServiceUrlHelper.getTemplateServiceDefinition();
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
            if (!this.credentials) {
                throw new Error(Messages.UndefinedClientCredentials);
            }
            this.client = new TemplateServiceClient(serviceDefinition.serviceUrl, this.credentials, {
                "Content-Type": "application/json; charset=utf-8"
            });
        } else {
            if (!this.githubPatToken) {
                throw new Error(Messages.UndefinedClientCredentials);
            }
            this.client = new TemplateServiceClient(serviceDefinition.serviceUrl, new TokenCredentials(this.githubPatToken, "token"), {
                "User-Agent": UserAgent,
                "Content-Type": "application/json; charset=utf-8"
            });
        }
        return this.client;
    }

    public static setClientCredentials(credentials: ServiceClientCredentials, githubPatToken: string): void {
        this.client = null;
        this.credentials = credentials;
        this.githubPatToken = ""
    }

    private static client: ITemplateServiceClient;
    private static credentials: ServiceClientCredentials;
    private static githubPatToken: string;
}
