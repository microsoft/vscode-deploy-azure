
import { RepositoryAnalysis } from "azureintegration-repoanalysis-client-internal";
import { RestClient } from "typed-rest-client";
import vscodeUri from "vscode-uri";
import { ExtendedPipelineTemplate } from "../model/Contracts";
import { StringMap } from "../model/models";
import { TemplateInfo } from "../model/templateModels";
import { ITemplateServiceClient } from "./ITemplateServiceClient";

export class ModaTemplateServiceClient implements ITemplateServiceClient {
    private restClient: RestClient;
    private githubPat: string;
    private pathUrl: string;
    private readonly apiVersion = "6.0-preview.1";
    private readonly extendedPipelineTemplateResource = "ExtendedPipelineTemplates";
    private readonly templatesInfoResource = "TemplatesInfo";
    private readonly templateAssetFilesResource = "TemplateAssetFiles";

    constructor(url: string, githubPat: string) {
        const u = vscodeUri.parse(url);
        this.restClient = new RestClient("deploy-to-azure", u.scheme + "://" + u.authority);
        this.pathUrl = u.path;
        this.githubPat = githubPat;
    }

    public async getTemplates(body: RepositoryAnalysis): Promise<TemplateInfo[]> {
        const requestUri = this.pathUrl + this.templatesInfoResource;
        const requestOptions = {
            acceptHeader: "application/json",
            additionalHeaders: {
                "Authorization": "Bearer " + this.githubPat
            },
            queryParameters: {
                'api-version': this.apiVersion
            }
        };
        return <TemplateInfo[]>(await this.restClient.create(requestUri, body, requestOptions)).result;
    }

    public async getTemplateParameters(templateId: string): Promise<ExtendedPipelineTemplate> {
        const requestUri = this.pathUrl + this.extendedPipelineTemplateResource;
        const requestOptions = {
            acceptHeader: "application/json",
            additionalHeaders: {
                "Authorization": "Bearer " + this.githubPat
            },
            queryParameters: {
                'templateId': templateId,
                'templatePartToGet': 'parameters',
                'api-version': this.apiVersion
            }
        };
        return <ExtendedPipelineTemplate>(await this.restClient.get(requestUri, requestOptions)).result;
    }

    public async getTemplateConfiguration(templateId: string, inputs: StringMap<string>): Promise<ExtendedPipelineTemplate> {
        const requestUri = this.pathUrl + this.extendedPipelineTemplateResource;
        const requestOptions = {
            acceptHeader: "application/json",
            additionalHeaders: {
                "Authorization": "Bearer " + this.githubPat
            },
            queryParameters: {
                'templateId': templateId,
                'templatePartToGet': 'configuration',
                'api-version': this.apiVersion
            }
        };
        return <ExtendedPipelineTemplate>(await this.restClient.create(requestUri, inputs, requestOptions)).result;
    }

    public async getTemplateFile(templateId: string, fileName: string): Promise<{ id: string, content: string }[]> {
        const requestUri = this.pathUrl + this.templateAssetFilesResource;
        const requestOptions = {
            acceptHeader: "application/json",
            additionalHeaders: {
                "Authorization": "Bearer " + this.githubPat
            },
            queryParameters: {
                'templateId': templateId,
                'fileNames': fileName,
                'api-version': this.apiVersion
            }
        };
        return <{ id: string, content: string }[]>(await this.restClient.get(requestUri, requestOptions)).result;
    }
}
