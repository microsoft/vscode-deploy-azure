import { AzureSession, SupportedLanguage, RepositoryAnalysisParameters, GitRepositoryParameters, RepositoryAnalysisRequest, RepositoryProvider } from "../model/models";
import { PortalExtensionClient } from "../clients/PortalExtensionClient";
import * as Q from 'q';
import { RepoAnalysis } from "../resources/constants";

export class RepoAnalysisHelper {
    private portalExtensionClient: PortalExtensionClient;

    constructor(azureSession: AzureSession) {
        this.portalExtensionClient = new PortalExtensionClient(azureSession.credentials);
    }

    public async getRepositoryAnalysis(sourceRepositoryDetails: GitRepositoryParameters): Promise<RepositoryAnalysisParameters> {
        let deferred = Q.defer<RepositoryAnalysisParameters>();

        //As of now this solution has support only for github
        if (sourceRepositoryDetails.repositoryProvider != RepositoryProvider.Github) {
            deferred.resolve();
        }

        var repositoryAnalysisResponse;
        try{
            let request: RepositoryAnalysisRequest = new RepositoryAnalysisRequest();
            request.id = sourceRepositoryDetails.repositoryId;
            request.defaultbranch = !!sourceRepositoryDetails.branch ? sourceRepositoryDetails.branch : RepoAnalysis.Master;

            repositoryAnalysisResponse = await this.portalExtensionClient.getRepositoryAnalysis(request);
            if (!!repositoryAnalysisResponse && repositoryAnalysisResponse.length === 0) {
                throw "No analysis result received";
            }
        }
        catch(e) {
            //Return empty if Repo Analysis fails
            deferred.resolve();
        }

        let parameters: RepositoryAnalysisParameters = new RepositoryAnalysisParameters();
        repositoryAnalysisResponse.languageSettingsList.forEach((analysis) => {

            if (!!analysis.language && parameters.languages.indexOf(analysis.language) === -1) {
                parameters.languages.push(analysis.language);
            }

            if (!!analysis.buildTargetName && parameters.buildTargets.indexOf(analysis.buildTargetName) === -1) {
                parameters.buildTargets.push(analysis.buildTargetName);
            }

            if (!!analysis.deployTargetName && parameters.deployTargets.indexOf(analysis.deployTargetName) === -1) {
                parameters.deployTargets.push(analysis.deployTargetName);
            }

            if (analysis.language === SupportedLanguage.NODE) {
                if (analysis.buildTargetName === RepoAnalysis.Gulp) {
                    if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysis.Gulp]) {
                        parameters.gulpFilePath = analysis.buildSettings[RepoAnalysis.GulpFilePath];
                    }
                }
                if (analysis.buildTargetName === RepoAnalysis.Grunt) {
                    if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysis.GruntFilePath]) {
                        parameters.gruntFilePath = analysis.buildSettings[RepoAnalysis.GruntFilePath];
                    }
                }
            }
            else if (analysis.language === SupportedLanguage.PYTHON) {
                if (analysis.buildTargetName === RepoAnalysis.Django) {
                    if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysis.RequirementsFilePath]) {
                        parameters.requirementsFilePath = analysis.buildSettings[RepoAnalysis.RequirementsFilePath];
                    }
                }
            }
        });

        if(parameters.languages.length == 0){
            parameters.languages.push(SupportedLanguage.NONE);
        }

        deferred.resolve(parameters);
        return deferred.promise;
    }
}
