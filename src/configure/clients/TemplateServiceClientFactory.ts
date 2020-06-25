import { ServiceClientCredentials } from "ms-rest";
import { RemoteServiceUrlHelper, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { PortalExtensionTemplateServiceClient } from "./github/PortalExtensionTemplateServiceClient";
import { ITemplateServiceClient } from "./ITemplateServiceClient";
import { ModaTemplateServiceClient } from "./modaTemplateServiceClient";


export class TemplateServiceClientFactory {

    private static client: ITemplateServiceClient;
    public static async getClient(credentials?: ServiceClientCredentials, githubPatToken?: string): Promise<ITemplateServiceClient> {
        if (!!this.client) {
            return this.client;
        }
        const serviceDefinition = await RemoteServiceUrlHelper.getTemplateServiceDefinition();
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
            this.client = new PortalExtensionTemplateServiceClient(serviceDefinition.serviceUrl, credentials);
        } else {
            this.client = new ModaTemplateServiceClient(serviceDefinition.serviceUrl, githubPatToken);
        }
        return this.client;
    }
}
