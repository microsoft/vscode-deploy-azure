import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { IServiceUrlDefinition, ServiceFramework } from "../helper/remoteServiceUrlHelper";
import { ProvisioningConfiguration } from "../model/provisioningConfiguration";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { RestClient } from "./restClient";

export class ProvisioningServiceClient implements IProvisioningServiceClient {
  private restClient: RestClient;
  private serviceDefinition: IServiceUrlDefinition;
  private defaultHeaders: { [propertyName: string]: string };
  private readonly pipelineProvisioningJob = "PipelineProvisioningJob";
  private readonly PEProvisioningServiceAPIVersion = "6.1-preview.1";

  constructor( serviceDefinition: IServiceUrlDefinition, headers: { [propertyName: string]: string }, credentials: ServiceClientCredentials) {
    this.restClient = new RestClient(credentials);
    this.serviceDefinition = serviceDefinition;
    this.defaultHeaders = headers;
  }

  public async createProvisioningConfiguration(provisioningConfiguration: ProvisioningConfiguration, githubOrg: string, repositoryId: string): Promise<ProvisioningConfiguration> {
    const requestUrl = this.serviceDefinition.serviceUrl + githubOrg + "/" + repositoryId + "/" + this.pipelineProvisioningJob;
    // tslint:disable-next-line:prefer-const
    let queryParams: { [propertyName: string]: string };
    if (this.serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
      queryParams = {"api-version": this.PEProvisioningServiceAPIVersion};
    }

    return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions> {
        url: requestUrl,
        method: "POST",
        headers: this.defaultHeaders,
        queryParameters: queryParams,
        body: provisioningConfiguration,
        serializationMapper: null,
        deserializationMapper: null,
      }
    );
  }

  public async getProvisioningConfiguration(jobId: string, githubOrg: string, repositoryId: string): Promise<ProvisioningConfiguration> {
    const requestUrl = this.serviceDefinition.serviceUrl + githubOrg + "/" + repositoryId + "/" + this.pipelineProvisioningJob +  "/" + jobId;
    // tslint:disable-next-line:prefer-const
    let queryParams: { [propertyName: string]: string };
    if (this.serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
      queryParams = {"api-version": this.PEProvisioningServiceAPIVersion};
    }

    return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions> {
        url: requestUrl,
        method: "GET",
        headers: this.defaultHeaders,
        queryParameters: queryParams,
        serializationMapper: null,
        deserializationMapper: null,
      }
    );
  }
}
