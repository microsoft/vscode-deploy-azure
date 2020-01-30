import * as util from 'util';
import { AzureDevOpsClient } from '../../clients/devOps/azureDevOpsClient';
import { ServiceConnectionClient } from '../../clients/devOps/serviceConnectionClient';
import { AadApplication } from '../../model/models';
import { Messages } from '../../resources/messages';

export class ServiceConnectionHelper {
    private serviceConnectionClient: ServiceConnectionClient;

    public constructor(organizationName: string, projectName: string, azureDevOpsClient: AzureDevOpsClient) {
        this.serviceConnectionClient = new ServiceConnectionClient(organizationName, projectName, azureDevOpsClient);
    }

    public async createGitHubServiceConnection(name: string, gitHubPat: string): Promise<string> {
        let response = await this.serviceConnectionClient.createGitHubServiceConnection(name, gitHubPat);
        let endpointId: string = response.id;
        await this.waitForGitHubEndpointToBeReady(endpointId);
        await this.serviceConnectionClient.authorizeEndpointForAllPipelines(endpointId)
            .then((response) => {
                if (response.allPipelines.authorized !== true) {
                    throw new Error(Messages.couldNotAuthorizeEndpoint);
                }
            });

        return endpointId;
    }

    public async createAzureSPNServiceConnection(name: string, tenantId: string, subscriptionId: string, scope: string, aadApp: AadApplication): Promise<string> {
        let response = await this.serviceConnectionClient.createAzureSPNServiceConnection(name, tenantId, subscriptionId, scope, aadApp);
        let endpointId = response.id;
        await this.waitForEndpointToBeReady(endpointId);
        await this.serviceConnectionClient.authorizeEndpointForAllPipelines(endpointId)
            .then((response) => {
                if (response.allPipelines.authorized !== true) {
                    throw new Error(Messages.couldNotAuthorizeEndpoint);
                }
            });
        return endpointId;
    }

    public async createAzurePublishProfileServiceConnection(name: string, tenantId: string, resourceId: string, publishProfile: string): Promise<string> {
        let response = await this.serviceConnectionClient.createAzurePublishProfileServiceConnection(name, tenantId, resourceId, publishProfile);
        let endpointId = response.id;
        await this.waitForEndpointToBeReady(endpointId);
        await this.serviceConnectionClient.authorizeEndpointForAllPipelines(endpointId)
            .then((response) => {
                if (response.allPipelines.authorized !== true) {
                    throw new Error(Messages.couldNotAuthorizeEndpoint);
                }
            });
        return endpointId;
    }

    public async createKubeConfigServiceConnection(name: string, kubeConfig: string, apiServerAddress: string): Promise<string> {
        let response = await this.serviceConnectionClient.createKubernetesServiceConnectionWithKubeConfig(name, kubeConfig, apiServerAddress);
        let endpointId = response.id;
        await this.serviceConnectionClient.authorizeEndpointForAllPipelines(endpointId)
            .then((response) => {
                if (response.allPipelines.authorized !== true) {
                    throw new Error(Messages.couldNotAuthorizeEndpoint);
                }
            });
        return endpointId;
    }

    public async createContainerRegistryServiceConnection(name: string, registryUrl: string, registryUsername: string, registryPassword?: string): Promise<string> {
        let response = await this.serviceConnectionClient.createContainerRegistryServiceConnection(name, registryUrl, registryUsername, registryPassword);
        let endpointId = response.id;
        await this.serviceConnectionClient.authorizeEndpointForAllPipelines(endpointId)
            .then((response) => {
                if (response.allPipelines.authorized !== true) {
                    throw new Error(Messages.couldNotAuthorizeEndpoint);
                }
            });
        return endpointId;
    }

    private async waitForEndpointToBeReady(endpointId: string): Promise<void> {
        let retryCount = 1;
        while (1) {
            let response = await this.serviceConnectionClient.getEndpointStatus(endpointId);
            let operationStatus = response.operationStatus;

            if (response.isReady) {
                break;
            }

            if (!(retryCount < 30) || operationStatus.state.toLowerCase() === "failed") {
                throw Error(util.format(Messages.unableToCreateAzureServiceConnection, operationStatus.state, operationStatus.statusMessage));
            }

            await this.sleepForMilliSeconds(2000);
            retryCount++;
        }
    }

    private async waitForGitHubEndpointToBeReady(endpointId: string): Promise<void> {
        let retryCount = 1;
        while (1) {
            let response = await this.serviceConnectionClient.getEndpointStatus(endpointId);
            let isReady: boolean = response.isReady;

            if (isReady === true) {
                break;
            }

            if (!(retryCount < 40)) {
                throw Error(util.format(Messages.unableToCreateGitHubServiceConnection, isReady));
            }

            await this.sleepForMilliSeconds(2000);
            retryCount++;
        }
    }

    private async sleepForMilliSeconds(timeInMs: number) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, timeInMs);
        });
    }
}
