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
        if(sourceRepositoryDetails.repositoryProvider != RepositoryProvider.Github){
            deferred.resolve();
        }

        var repositoryAnalysisResponse;
        try{
            let request: RepositoryAnalysisRequest = new RepositoryAnalysisRequest();
            request.id = sourceRepositoryDetails.repositoryId;
            request.defaultbranch = !!sourceRepositoryDetails.branch ? sourceRepositoryDetails.branch : RepoAnalysis.Master;

            repositoryAnalysisResponse = await this.portalExtensionClient.getRepositoryAnalysis(request);
            if(!!repositoryAnalysisResponse && repositoryAnalysisResponse.length === 0){
                throw "No analysis result received";
            }
        }
        catch(e){
            deferred.resolve();
        }

        let parameters: RepositoryAnalysisParameters = new RepositoryAnalysisParameters();
        repositoryAnalysisResponse.repositoryanalysislist.forEach((analysis) => {

            if (parameters.languages.indexOf(SupportedLanguage[analysis.language]) === -1){
                parameters.languages.push(SupportedLanguage[analysis.language]);
            }

            if (!!analysis.buildtargetname && parameters.buildTargets.indexOf(analysis.buildtargetname) === -1){
                parameters.buildTargets.push(analysis.buildtargetname);
            }

            if (!!analysis.deploytargetname && parameters.deployTargets.indexOf(analysis.deploytargetname) === -1){
                parameters.deployTargets.push(analysis.deploytargetname);
            }

            if(analysis.language === SupportedLanguage.NODE){
                if (analysis.buildtargetname === RepoAnalysis.Gulp) {
                    if(!!analysis.buildtargetsettings[RepoAnalysis.GulpFilePath]){
                        parameters.gulpFilePath = analysis.buildtargetsettings[RepoAnalysis.GulpFilePath];
                    }
                }
                if (analysis.buildtargetname === RepoAnalysis.Grunt) {
                    if(!!analysis.buildtargetsettings[RepoAnalysis.GruntFilePath]){
                        parameters.gruntFilePath = analysis.buildtargetsettings[RepoAnalysis.GruntFilePath];
                    }
                }
            }
            else if(analysis.language === SupportedLanguage.PYTHON){
                if (analysis.buildtargetname === RepoAnalysis.Django) {
                    if(!!analysis.buildtargetsettings[RepoAnalysis.RequirementsFilePath]){
                        parameters.gulpFilePath = analysis.buildtargetsettings[RepoAnalysis.RequirementsFilePath];
                    }
                }
            }
        });

        deferred.resolve(parameters);
        return deferred.promise;
    }
}
