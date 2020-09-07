import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { ProvisioningConfiguration } from "../model/provisioningConfiguration";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { RestClient } from "./restClient";

export class ProvisioningServiceClient implements IProvisioningServiceClient {
  private restClient: RestClient;
  private baseUrl: string;
  private defaultHeaders: { [propertyName: string]: string };
  private readonly pipelineProvisioningJob = "PipelineProvisioningJob";
  constructor( baseUrl: string, headers: { [propertyName: string]: string }, credentials: ServiceClientCredentials) {
    this.restClient = new RestClient(credentials);
    this.baseUrl = baseUrl;
    this.defaultHeaders = headers;
  }

  public async createProvisioningConfiguration(provisioningConfiguration: ProvisioningConfiguration, githubOrg: string, repositoryId: string, queryParams?: { [propertyName: string]: string } ): Promise<ProvisioningConfiguration> {
    const requestUrl = this.baseUrl + githubOrg + "/" + repositoryId + "/" + this.pipelineProvisioningJob;
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

  public async getProvisioningConfiguration(jobId: string, githubOrg: string, repositoryId: string, queryParams?: { [propertyName: string]: string }): Promise<ProvisioningConfiguration> {
    const requestUrl = this.baseUrl + githubOrg + "/" + repositoryId + "/" + this.pipelineProvisioningJob +  "/" + jobId;
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
