import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { ProvisioningConfiguration } from "../model/provisioningConfiguration";
import { IProvisioningServiceClient } from "./IProvisioningServiceClient";
import { RestClient } from "./restClient";


export class ProvisioningServiceClient implements IProvisioningServiceClient {
  private restClient: RestClient;
  private url: string;
  constructor( url: string, credentials: ServiceClientCredentials) {
    this.restClient = new RestClient(credentials);
    this.url = url;
}

  public async createProvisioningConfiguration(provisioningConfiguration: ProvisioningConfiguration, relativeUrl: string ): Promise<ProvisioningConfiguration> {  
    console.log(this.url + relativeUrl);
    return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
        url: this.url + relativeUrl,
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: provisioningConfiguration,
        serializationMapper: null,
        deserializationMapper: null,
      }
    );
  }

  public async getProvisioningConfiguration(relativeUrl: string): Promise<ProvisioningConfiguration> {
    console.log(this.url + relativeUrl);
    return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
        url: this.url + relativeUrl,
        method: "GET",
        serializationMapper: null,
        deserializationMapper: null,
      }
    );  
  }
}
