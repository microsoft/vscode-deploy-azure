import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { ProvisioningConfiguration } from "../model/provisioningConfiguration";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { RestClient } from "./restClient";

export class ProvisioningServiceClient implements IProvisioningServiceClient {
  private restClient: RestClient;
  private baseUrl: string;
  private defaultHeaders: { [propertyName: string]: string };
  private readonly pipelineProvisioningJob = "PipelineProvisioningJob";
  
  constructor( baseUrl: string, githubPAT: string,  credentials: ServiceClientCredentials) {
    this.restClient = new RestClient(credentials);
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      "X-GITHUB-TOKEN" : githubPAT,
    };
  }

  public async createProvisioningConfiguration(provisioningConfiguration: ProvisioningConfiguration, githubOrg: string, repositoryId: string, queryParameters?: { [propertyName: string]: string } ): Promise<ProvisioningConfiguration> {  
    const requestUrl = this.baseUrl + githubOrg + "/" + repositoryId + "/" + this.pipelineProvisioningJob;
    return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
        url: requestUrl,
        method: "POST",
        headers: this.defaultHeaders,
        queryParameters: queryParameters,
        body: provisioningConfiguration,
        serializationMapper: null,
        deserializationMapper: null,
      }
    );
  }

  public async getProvisioningConfiguration(jobId: string,githubOrg: string, repositoryId: string, queryParameters?: { [propertyName: string]: string }): Promise<ProvisioningConfiguration> {
    const requestUrl = this.baseUrl + githubOrg + "/" + repositoryId + "/" + this.pipelineProvisioningJob +  "/" + jobId;
    return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
        url: requestUrl,
        method: "GET",
        headers: this.defaultHeaders,
        queryParameters: queryParameters,
        serializationMapper: null,
        deserializationMapper: null,
      }
    );  
  }
}
