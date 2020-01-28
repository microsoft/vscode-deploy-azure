import { PortalExtensionClient } from "../clients/portalExtensionClient";
import { AzureSession, SupportedLanguage, GitRepositoryParameters, RepositoryAnalysisRequest, RepositoryProvider, NodeBuildSettings, PythonBuildSettings, RepositoryAnalysisParameters, LanguageSettings, extensionVariables } from "../model/models";
import { RepoAnalysis } from "../resources/constants";

export class RepoAnalysisHelper {
    private portalExtensionClient: PortalExtensionClient;

    constructor(azureSession: AzureSession) {
        this.portalExtensionClient = new PortalExtensionClient(azureSession.credentials);
    }

    public async getRepositoryAnalysis(sourceRepositoryDetails: GitRepositoryParameters): Promise<RepositoryAnalysisParameters> {

        //As of now this solution has support only for github
        if (!extensionVariables.enableRepoAnalysis && sourceRepositoryDetails.repositoryProvider != RepositoryProvider.Github) {
            return null;
        }

        var repositoryAnalysisResponse;
        try{
            let request: RepositoryAnalysisRequest = new RepositoryAnalysisRequest();
            request.id = sourceRepositoryDetails.repositoryId;
            request.defaultbranch = !!sourceRepositoryDetails.branch ? sourceRepositoryDetails.branch : RepoAnalysis.Master;

            repositoryAnalysisResponse = await this.portalExtensionClient.getRepositoryAnalysis(request);
            if (!!repositoryAnalysisResponse && repositoryAnalysisResponse.length === 0) {
                return null;
            }
        }
        catch(e) {
            //Return empty if Repo Analysis fails
            return null;
        }

        let parameters: RepositoryAnalysisParameters = new RepositoryAnalysisParameters();
        repositoryAnalysisResponse.languageSettingsList.forEach((analysis) => {
            if(Object.keys(SupportedLanguage).indexOf(analysis.language.toUpperCase()) > -1){
                let settings: LanguageSettings = new LanguageSettings();
                settings.buildTargetName = analysis.buildTargetName;
                settings.deployTargetName = analysis.deployTargetName;

                let buildSettings;
                if (analysis.language === SupportedLanguage.NODE) {
                    settings.language = SupportedLanguage.NODE;

                    buildSettings = new NodeBuildSettings();
                    if (analysis.buildTargetName === RepoAnalysis.Gulp) {
                        if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysis.GulpFilePath]) {
                            buildSettings.gulpFilePath = analysis.buildSettings[RepoAnalysis.GulpFilePath];
                        }
                    }
                    if (analysis.buildTargetName === RepoAnalysis.Grunt) {
                        if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysis.GruntFilePath]) {
                            buildSettings.gruntFilePath = analysis.buildSettings[RepoAnalysis.GruntFilePath];
                        }
                    }
                }
                else if (analysis.language === SupportedLanguage.PYTHON) {
                    settings.language = SupportedLanguage.PYTHON;

                    buildSettings = new PythonBuildSettings();
                    if (analysis.buildTargetName === RepoAnalysis.Django) {
                        if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysis.RequirementsFilePath]) {
                            buildSettings.requirementsFilePath = analysis.buildSettings[RepoAnalysis.RequirementsFilePath];
                        }
                    }
                }
                settings.buildSettings = buildSettings;
                parameters.languageSettingsList.push(settings);
            }
        });
        return parameters;;
    }
}
