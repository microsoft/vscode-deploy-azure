const uuid = require('uuid/v4');
import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import { WebSiteManagementClient } from 'azure-arm-website';
import { SiteConfigResource, StringDictionary, Deployment } from 'azure-arm-website/lib/models';
import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from 'ms-rest';

import { AzureResourceClient } from './azureResourceClient';
import { WebAppKind, ParsedAzureResourceId, WebAppSourceControl } from '../../model/models';
import {Messages} from '../../resources/messages';
import { AzureEnvironment } from 'ms-rest-azure';
import { telemetryHelper } from '../../helper/telemetryHelper';
import { TelemetryKeys } from '../../resources/telemetryKeys';

export class AppServiceClient extends AzureResourceClient {

    private static resourceType = 'Microsoft.Web/sites';
    private webSiteManagementClient: WebSiteManagementClient;
    private tenantId: string;
    private environment: AzureEnvironment;

    constructor(credentials: ServiceClientCredentials, environment: AzureEnvironment, tenantId: string, subscriptionId: string) {
        super(credentials, subscriptionId);
        this.webSiteManagementClient = new WebSiteManagementClient(credentials, subscriptionId);
        this.tenantId = tenantId;
        this.environment = environment;
    }

    public async getAppServiceResource(resourceId: string): Promise<GenericResource> {
        let parsedResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(resourceId);
        return await this.webSiteManagementClient.webApps.get(parsedResourceId.resourceGroup, parsedResourceId.resourceName);
    }

    public async GetAppServices(filtersForResourceKind: WebAppKind[]): Promise<ResourceListResult> {
        let resourceList: ResourceListResult = await this.getResourceList(AppServiceClient.resourceType);
        if (!!filtersForResourceKind && filtersForResourceKind.length > 0) {
            let filteredResourceList: ResourceListResult = [];

                if(WebAppKind.FunctionAppLinux in filtersForResourceKind) {
                        filtersForResourceKind.concat(WebAppKind.FunctionAppLinuxContainer);
                }

                resourceList.forEach((resource) => {
                    if (filtersForResourceKind.some((kind) => resource.kind === kind)) {
                        filteredResourceList.push(resource);
                    }
                });

            resourceList = filteredResourceList;
        }
        return resourceList;
    }

    public async getWebAppPublishProfileXml(resourceId: string): Promise<string> {
        let parsedResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(resourceId);
        let publishingProfileStream = await this.webSiteManagementClient.webApps.listPublishingProfileXmlWithSecrets(parsedResourceId.resourceGroup, parsedResourceId.resourceName, {});
        while (!publishingProfileStream.readable) {
            // wait for stream to be readable.
        }

        let publishProfile = '';
        while (true) {
            let moreData: Buffer = publishingProfileStream.read();
            if (moreData) {
                publishProfile += moreData.toString();
            }
            else {
                break;
            }
        }

        return publishProfile;
    }

    public async getDeploymentCenterUrl(resourceId: string): Promise<string> {
        return `${this.environment.portalUrl}/#@${this.tenantId}/resource/${resourceId}/vstscd`;
    }

    public async getAzurePipelineUrl(resourceId: string): Promise<string> {
        let metadata = await this.getAppServiceMetadata(resourceId);
        if (metadata.properties['VSTSRM_BuildDefinitionWebAccessUrl']) {
            return metadata.properties['VSTSRM_BuildDefinitionWebAccessUrl'];
        }

        throw new Error(Messages.cannotFindPipelineUrlInMetaDataException);
    }

    public async getAppServiceConfig(resourceId: string): Promise<SiteConfigResource> {
        let parsedResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(resourceId);
        return this.webSiteManagementClient.webApps.getConfiguration(parsedResourceId.resourceGroup, parsedResourceId.resourceName);
    }

    public async updateScmType(resourceId: string): Promise<SiteConfigResource> {
        let siteConfig = await this.getAppServiceConfig(resourceId);
        siteConfig.scmType = ScmType.VSTSRM;
        let parsedResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(resourceId);
        return this.webSiteManagementClient.webApps.updateConfiguration(parsedResourceId.resourceGroup, parsedResourceId.resourceName, siteConfig);
    }

    public async getAppServiceMetadata(resourceId: string): Promise<StringDictionary> {
        let parsedResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(resourceId);
        return this.webSiteManagementClient.webApps.listMetadata(parsedResourceId.resourceGroup, parsedResourceId.resourceName);
    }

    public async updateAppServiceMetadata(resourceId: string, metadata: StringDictionary): Promise<StringDictionary> {
        let parsedResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(resourceId);
        return this.webSiteManagementClient.webApps.updateMetadata(parsedResourceId.resourceGroup, parsedResourceId.resourceName, metadata);
    }

    public async publishDeploymentToAppService(resourceId: string, deploymentMessage: DeploymentMessage | VSTSDeploymentMessage): Promise<Deployment> {
        let parsedResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(resourceId);

        // create deployment object
        let deploymentId = uuid();
        let deployment = this.createDeploymentObject(deploymentId, deploymentMessage);
        return this.webSiteManagementClient.webApps.createDeployment(parsedResourceId.resourceGroup, parsedResourceId.resourceName, deploymentId, deployment);
    }

    public async setGitHubActionSourceControl(resourceId: string, githubRepositoryUrl: string, githubBranch: string): Promise<void> {
        await this.webSiteManagementClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `${this.environment.resourceManagerEndpointUrl}${resourceId}/sourcecontrols/web`,
            method: "PUT",
            queryParameters: {
                'api-version': '2018-11-01'
            },
            body: {
                "properties": {
                    "isGitHubAction": true,
                    "repoUrl": githubRepositoryUrl,
                    "branch": githubBranch,
                }
            },
            serializationMapper: null,
            deserializationMapper: null
        });
    }

    public async getSourceControl(resourceId: string): Promise<WebAppSourceControl> {
        return this.webSiteManagementClient.sendRequest<WebAppSourceControl>(<UrlBasedRequestPrepareOptions>{
            url: `${this.environment.resourceManagerEndpointUrl}${resourceId}/sourcecontrols/web`,
            method: "GET",
            queryParameters: {
                'api-version': '2018-11-01'
            },
            serializationMapper: null,
            deserializationMapper: null
        });
    }

    public async isScmTypeSet(resourceId: string): Promise<boolean> {
        // Check for SCM type, if its value is set then a pipeline is already setup.
        let siteConfig = await this.getAppServiceConfig(resourceId);
        if (!!siteConfig.scmType && siteConfig.scmType.toLowerCase() != ScmType.NONE.toLowerCase()) {
            telemetryHelper.setTelemetry(TelemetryKeys.ScmType, siteConfig.scmType.toLowerCase());
            return true;
        }

        return false;
    }

    private createDeploymentObject(deploymentId: string, deploymentMessage: DeploymentMessage): Deployment {
        let deployment: Deployment = {
            id: deploymentId,
            status: 4,
            author: 'VSTS',
            deployer: 'VSTS',
            message: JSON.stringify(deploymentMessage)
        };

        return deployment;
    }
}

export enum ScmType {
    VSTSRM = 'VSTSRM',
    NONE = 'NONE',
    GITHUBACTION = 'GITHUBACTION'
}

export interface DeploymentMessage {
    type: string;
    message: string;
}

export interface VSTSDeploymentMessage extends DeploymentMessage {
    VSTSRM_BuildDefinitionWebAccessUrl?: string;
    VSTSRM_ConfiguredCDEndPoint: string;
    VSTSRM_BuildWebAccessUrl: string;
}