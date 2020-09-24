import { PathTemplateBasedRequestPrepareOptions, ServiceClient, ServiceClientCredentials, ServiceClientOptions, UrlBasedRequestPrepareOptions } from "ms-rest";

export interface IPathTemplateBasedRequestPrepareOptions2 extends PathTemplateBasedRequestPrepareOptions {
    returnFullResponseForFailure?: boolean;
}

export interface IUrlBasedRequestPrepareOptions2 extends UrlBasedRequestPrepareOptions {
    returnFullResponseForFailure?: boolean;
}

export class RestClient extends ServiceClient {
    constructor(credentials?: ServiceClientCredentials, options?: ServiceClientOptions) {
        super(credentials, options);
    }

    public sendRequest<TResult>(options: IPathTemplateBasedRequestPrepareOptions2 | IUrlBasedRequestPrepareOptions2): Promise<TResult> {
        return new Promise<TResult>((resolve, reject) => {
            super.sendRequestWithHttpOperationResponse<TResult>(options)
                .then((response) => {
                    if (response.response.statusCode >= 300) {
                        if (options.returnFullResponseForFailure === true) {
                            reject(response);
                        }
                        else {
                            reject(response.body);
                        }
                    }
                    resolve(response.body);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public sendRequest2(url: string, httpMethod: string, apiVersion: string, body?: any): Promise<any> {
        return this.sendRequest(
            {
                url: url,
                method: httpMethod,
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                },
                queryParameters: {
                    'api-version': apiVersion
                },
                body: body,
                deserializationMapper: null,
                serializationMapper: null
            });
    }
}