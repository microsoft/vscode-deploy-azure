import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import { ServiceClientCredentials } from 'ms-rest';
import * as ResourceManagementClient from 'azure-arm-resource/lib/resource/resourceManagementClient';
import { TargetResourceType, TargetKind } from '../../model/models';
import * as utils from 'util';
import { Messages } from '../../resources/messages';

export class AzureResourceClient {

    private azureRmClient: ResourceManagementClient.ResourceManagementClient;

    constructor(credentials: ServiceClientCredentials, subscriptionId: string) {
        this.azureRmClient = new ResourceManagementClient.ResourceManagementClient(credentials, subscriptionId);
    }

    public static validateTargetResourceType(resource: GenericResource): void {
        if (!resource) {
            throw new Error(Messages.azureResourceIsNull);
        }

        switch (resource.type.toLowerCase()) {
            case TargetResourceType.WebApp.toLowerCase():
                switch (resource.kind ? resource.kind.toLowerCase() : '') {
                    case TargetKind.LinuxApp:
                    case TargetKind.FunctionAppLinux:
                    case TargetKind.WindowsApp:
                        return;
                    case TargetKind.LinuxContainerApp:
                    case TargetKind.FunctionApp:
                    default:
                        throw new Error(utils.format(Messages.appKindIsNotSupported, resource.kind));
                }
            case TargetResourceType.AKS.toLowerCase():
                return;
            default:
                throw new Error(utils.format(Messages.resourceTypeIsNotSupported, resource.type));
        }
    }

    public async getResourceList(resourceType: string, followNextLink: boolean = true): Promise<ResourceListResult> {
        let resourceListResult: ResourceListResult = await this.azureRmClient.resources.list({ filter: `resourceType eq '${resourceType}'` });

        if (followNextLink) {
            let nextLink: string = resourceListResult.nextLink;
            while (!!nextLink) {
                let nextResourceListResult = await this.azureRmClient.resources.listNext(nextLink);
                resourceListResult = resourceListResult.concat(nextResourceListResult);
                nextLink = nextResourceListResult.nextLink;
            }
        }

        return resourceListResult;
    }

    public async getResource(resourceId: string, apiVersion: string = '2019-10-01'): Promise<GenericResource> {
        let resource: GenericResource = await this.azureRmClient.resources.getById(resourceId, apiVersion);
        return resource;
    }
}
