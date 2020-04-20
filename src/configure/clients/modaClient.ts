import { IRestResponse, RestClient } from "typed-rest-client";
import vscodeUri from "vscode-uri";
import { RepositoryAnalysisRequest } from "../model/models";

export class ModaClient{
    private restClient: RestClient;
    private githubPat: string;
    private pathUrl: string;

    constructor(url: string, githubPat: string) {
        const u = vscodeUri.parse(url);
        this.restClient = new RestClient("deploy-to-azure", u.scheme + "://" + u.authority);
        this.pathUrl = u.path;
        this.githubPat = githubPat;
    }

    public async getRepositoryAnalysis(body: RepositoryAnalysisRequest): Promise<IRestResponse<unknown>> {
        const requestOptions = {
            acceptHeader: "application/json",
            additionalHeaders: {
                "Authorization": "Bearer " + this.githubPat
            }
        };
        return this.restClient.create(this.pathUrl, body, requestOptions);
    }
}