import { RestClient } from "typed-rest-client";
import { TracePoints } from "../resources/tracePoints";
import { telemetryHelper } from "./telemetryHelper";

export enum ServiceFramework {
    Moda,
    Vssf
}

export interface IServiceUrlDefinition {
    serviceFramework: ServiceFramework;
    serviceUrl: string;
}

export class RemoteServiceUrlHelper {
    public static repoAnalysisRedirectUrl: string = "https://go.microsoft.com/fwlink/?linkid=2127646";
    public static templateServiceRedirectUrl: string = "https://go.microsoft.com/fwlink/?linkid=2133849";
    public static provisioningServiceRedirectUrl: string = "https://go.microsoft.com/fwlink/?linkid=2142042";
    public static repoAnalysisStagingRedirectUrl: string = "https://go.microsoft.com/fwlink/?linkid=2156682";
    public static templateServiceStagingRedirectUrl: string = "https://go.microsoft.com/fwlink/?linkid=2156978";
    public static provisioningServiceStagingRedirectUrl: string = "https://go.microsoft.com/fwlink/?linkid=2156977";

    public static async getTemplateServiceDefinition(): Promise<IServiceUrlDefinition> {
        const deployment = process.env["DEPLOY_TO_AZURE_EXT_ENVIRONMENT"];
        if (deployment != undefined && deployment === "development") {
            return {
                serviceFramework: ServiceFramework.Moda,
                serviceUrl: process.env["PROXY_URL"]
            } as IServiceUrlDefinition;
        }

        if (deployment != undefined && deployment === "test") {
            return this.getServiceurlDefinition("https://pepfcusc.portalext.visualstudio.com/_apis/TemplateService/", this.templateServiceStagingRedirectUrl);
        }

        return this.getServiceurlDefinition("https://peprodscussu2.portalext.visualstudio.com/_apis/TemplateService/", this.templateServiceRedirectUrl);
    }

    public static async getRepositoryAnalysisDefinition(): Promise<IServiceUrlDefinition> {
        const deployment = process.env["DEPLOY_TO_AZURE_EXT_ENVIRONMENT"];
        if (deployment != undefined && deployment === "test") {
            return this.getServiceurlDefinition("https://pepfcusc.portalext.visualstudio.com/_apis/RepositoryAnalysis?api-version=5.2-preview.1", this.repoAnalysisStagingRedirectUrl);
        }

        return this.getServiceurlDefinition("https://peprodscussu2.portalext.visualstudio.com/_apis/RepositoryAnalysis?api-version=5.2-preview.1", this.repoAnalysisRedirectUrl);
    }

    public static async getProvisioningServiceDefinition(): Promise<IServiceUrlDefinition> {
        const deployment = process.env["DEPLOY_TO_AZURE_EXT_ENVIRONMENT"];
        if (deployment != undefined && deployment === "development") {
            return {
                serviceFramework: ServiceFramework.Moda,
                serviceUrl: process.env["PROXY_URL"] + "repos/"
            } as IServiceUrlDefinition;
        }

        if (deployment != undefined && deployment === "test") {
            return this.getServiceurlDefinition("https://pepfcusc.portalext.visualstudio.com/_apis/PipelineProvisioningService/", this.provisioningServiceStagingRedirectUrl);
        }


        return this.getServiceurlDefinition("https://peprodscussu2.portalext.visualstudio.com/_apis/ProvisioningService/", this.provisioningServiceRedirectUrl);
    }

    private static async getServiceurlDefinition(serviceUrl: string, redirectUrl: string) {
        const result = <IServiceUrlDefinition>{
            serviceFramework: ServiceFramework.Vssf,
            serviceUrl: serviceUrl
        };
        try {
            const requestOptions = {
                allowRedirects: false
            };
            const restClient = new RestClient("deploy-to-azure", "", [], requestOptions);
            const response = await restClient.client.get(redirectUrl, requestOptions);
            if ((response.message.statusCode === 301 || response.message.statusCode === 302)) {
                result.serviceUrl = response.message.headers["location"];
            } else {
                throw Error("Invalid response from url " + redirectUrl);
            }
            if (!result.serviceUrl.includes("portalext.visualstudio.com")) {
                result.serviceFramework = ServiceFramework.Moda;
            }
        } catch (error) {
            telemetryHelper.logError('configure', TracePoints.RemoteServiceUrlFetchFailed, error);
        }
        return result;

    }
}
