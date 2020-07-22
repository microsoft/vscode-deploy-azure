import { ServiceClientCredentials } from "ms-rest";
import { AzureEnvironment } from "ms-rest-azure";
import { AppServiceClient } from "../clients/azure/appServiceClient";
import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { TargetResourceType } from "../model/models";
import { Messages } from "../resources/messages";
import { AksAzureResourceSelector } from "./AksAzureResourceSelector";
import { IAzureResourceSelector } from "./IAzureResourceSelector";
import { WebAppAzureResourceSelector } from "./WebAppAzureResourceSelector";

export class ResourceSelectorFactory {

    public static getAzureResourceSelector(targetType: TargetResourceType): IAzureResourceSelector {
        switch (targetType) {
            case TargetResourceType.WebApp:
                return new WebAppAzureResourceSelector();
            case TargetResourceType.AKS:
                return new AksAzureResourceSelector();
            default:
                throw new Error(Messages.ResourceNotSupported);
        }
    }

    public static getAzureResourceClient(targetType: TargetResourceType, credentials: ServiceClientCredentials, environment: AzureEnvironment, tenantId: string, subscriptionId: string): AzureResourceClient {
        switch (targetType) {
            case TargetResourceType.WebApp:
                return new AppServiceClient(credentials, environment, tenantId, subscriptionId);
            case TargetResourceType.AKS:
                return new AzureResourceClient(credentials, subscriptionId);
            default:
                throw new Error(Messages.ResourceNotSupported);
        }
    }
}