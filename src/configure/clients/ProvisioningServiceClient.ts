import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { IServiceUrlDefinition, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { ProvisioningConfiguration } from "../model/provisioningConfiguration";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { RestClient } from "./restClient";

export class ProvisioningServiceClient implements IProvisioningServiceClient {
  private restClient: RestClient;
  private serviceDefinition: IServiceUrlDefinition;
  private defaultHeaders: { [propertyName: string]: string };
  private defaultParameters: { [propertyName: string]: string };
  private readonly pipelineProvisioningJob = "PipelineProvisioningJob";
  private readonly PEProvisioningServiceAPIVersion = "6.1-preview.1";

  constructor(serviceDefinition: IServiceUrlDefinition, headers: { [propertyName: string]: string }, credentials: ServiceClientCredentials) {
    this.restClient = new RestClient(credentials);
    this.serviceDefinition = serviceDefinition;
    this.defaultHeaders = headers;
    if (this.serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
      this.defaultParameters = { "api-version": this.PEProvisioningServiceAPIVersion };
    }
  }

  public async createProvisioningConfiguration(provisioningConfiguration: ProvisioningConfiguration, githubOrg: string, repositoryId: string): Promise<ProvisioningConfiguration> {
    const requestUrl = "https://pepfcusc.portalext.visualstudio.com/_apis/PipelineProvisioningService/" + githubOrg + "/" + repositoryId + "/" + this.pipelineProvisioningJob;

    return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
      url: requestUrl,
      method: "POST",
      headers: this.defaultHeaders,
      queryParameters: this.defaultParameters,
      body: provisioningConfiguration,
      serializationMapper: null,
      deserializationMapper: null,
    }
    );
  }

  public async getProvisioningConfiguration(jobId: string, githubOrg: string, repositoryId: string): Promise<ProvisioningConfiguration> {
    const requestUrl = "https://pepfcusc.portalext.visualstudio.com/_apis/PipelineProvisioningService/" + githubOrg + "/" + repositoryId + "/" + this.pipelineProvisioningJob + "/" + jobId;

    return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
      url: requestUrl,
      method: "GET",
      headers: this.defaultHeaders,
      queryParameters: this.defaultParameters,
      serializationMapper: null,
      deserializationMapper: null,
    }
    );
  }
}
