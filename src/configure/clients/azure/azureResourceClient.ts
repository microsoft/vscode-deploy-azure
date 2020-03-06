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

    public async updateCdSetupResourceTag(resource: GenericResource, repositoryId: string, branch: string, workflowFileName: string, commitId: string, namespaceName: string, apiVersion: string = '2019-10-01'): Promise<GenericResource> {
        let deploymentData: string = "GH" + ":" + repositoryId + ":" + branch + ":" + workflowFileName + ":" + workflowFileName + ":" + commitId + ":" + namespaceName + ":" + Date.now();
        resource.tags = resource.tags ? resource.tags :  {};
        resource.tags = this.ComputeDeploymentResourceTags(resource.tags, deploymentData);
        return await this.azureRmClient.resources.updateById(resource.id, apiVersion, resource);
    }

    private ComputeDeploymentResourceTags(resourceTags: { [key: string]: string }, deploymentData: string) {
        let startNewRow: boolean = true;
        let storageColumn: boolean = true; //if storageColumn = true -> store in Tag Key field, else Tag Value field
        let newTagKey: string = "";
        let newTagValue: string = "";

        for (let tagName in resourceTags) {
            //check if existing entry for resource tags
            if (tagName.startsWith(DevopsInfoTagHeader)) {
                // check if resource tags can be stored in tag Key field
                if (resourceTags[tagName].length + deploymentData.length < MaxTagKeyLength) {
                    startNewRow = false;
                    newTagKey = tagName;
                    newTagValue = resourceTags[tagName];
                    resourceTags[tagName] = null;
                    break;
                }
                // check if resource tags can be stored in tag Value field
                else if (resourceTags[tagName].length + deploymentData.length < MaxTagValueLength) {
                    storageColumn = false;
                    startNewRow = false;
                    newTagKey = tagName;
                    newTagValue = resourceTags[tagName];
                    resourceTags[tagName] = null;
                    break;
                }
            }
        }

        if (newTagKey) {
            let tempResourceTags = {};
            for (let key in resourceTags) {
                if (key !== newTagKey) {
                    tempResourceTags[key] = resourceTags[key];
                }
            }
            resourceTags = tempResourceTags;
        }

        if (startNewRow) {
            if (Object.keys(resourceTags).length > MaxTagsRow) {
                throw new Error(Messages.EmptyTagRowUnavailable);
            }
            newTagKey = DevopsInfoTagHeader;
        }

        if (storageColumn) {   //Store resource tag in key field
            newTagKey += deploymentData + ";";
        }
        else {   //Store resource tag in value field
            newTagValue += deploymentData + ";";
        }

        resourceTags[newTagKey] = newTagValue;
        return resourceTags;
    }
}

export let ApiVersions: Map<TargetResourceType, string> = new Map<TargetResourceType, string>();
ApiVersions.set(TargetResourceType.ACR, '2019-05-01');
ApiVersions.set(TargetResourceType.AKS, '2019-10-01');

const DevopsInfoTagHeader: string = "hidden-DevOpsInfo:";
const MaxTagKeyLength: number = 512;
const MaxTagValueLength: number = 256;
const MaxTagsRow: number = 50;
