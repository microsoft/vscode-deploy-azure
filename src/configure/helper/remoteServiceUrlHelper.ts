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
    public static repoAnalysisRedirectUrl: string  = "https://go.microsoft.com/fwlink/?linkid=2127646";

    public static async getRepositoryAnalysisDefinition(): Promise<IServiceUrlDefinition> {
        const result = <IServiceUrlDefinition>{
            serviceFramework: ServiceFramework.Vssf,
            serviceUrl: "https://pepfcusc.portalext.visualstudio.com/_apis/RepositoryAnalysis?api-version=5.2-preview.1"
        };
        try {
            const requestOptions = {
                allowRedirects: false
            };
            const restClient = new RestClient("deploy-to-azure", "", [], requestOptions);
            const response = await restClient.client.get(RemoteServiceUrlHelper.repoAnalysisRedirectUrl, requestOptions);
            if ((response.message.statusCode === 301 || response.message.statusCode === 302)){
                result.serviceUrl = response.message.headers["location"];
            } else {
                throw Error("Invalid response from url " + RemoteServiceUrlHelper.repoAnalysisRedirectUrl);
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
