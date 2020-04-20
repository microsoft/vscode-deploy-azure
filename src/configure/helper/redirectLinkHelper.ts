import { RestClient } from "typed-rest-client";

export enum ServiceFramework {
    Moda,
    Vssf
}

export class RedirectLinkHelper {

    public repoAnalysisRedirectUrl: string  = "https://aka.ms/AA87j8k";
    public repoAnalysisUrl: string = "";
    public repoAnalysisServiceFramework: ServiceFramework = ServiceFramework.Vssf;

    public async loadAll() {
        await this.loadRepoAnalysis();
    }

    private async loadRepoAnalysis() {
        this.repoAnalysisServiceFramework = ServiceFramework.Vssf;
        const requestOptions = {
            allowRedirects: false
        };
        const restClient = new RestClient("deploy-to-azure", "", [], requestOptions);
        const response = await restClient.client.get(this.repoAnalysisRedirectUrl, requestOptions);
        if ((response.message.statusCode === 301 || response.message.statusCode === 302)){
            this.repoAnalysisUrl = response.message.headers["location"];
        } else {
            throw Error("Invalid response from url " + this.repoAnalysisRedirectUrl);
        }
        if (!this.repoAnalysisUrl.includes("portalext.visualstudio.com")) {
            this.repoAnalysisServiceFramework = ServiceFramework.Moda;
        }
    }
}