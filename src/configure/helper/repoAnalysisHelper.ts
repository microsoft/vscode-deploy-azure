import { PortalExtensionClient } from "../clients/portalExtensionClient";
import { AzureSession, SupportedLanguage, GitRepositoryParameters, RepositoryAnalysisRequest, RepositoryProvider, NodeBuildSettings, PythonBuildSettings, RepositoryAnalysisParameters, LanguageSettings, extensionVariables, RepositoryDetails, BuildSettings } from "../model/models";
import { RepoAnalysisConstants } from "../resources/constants";

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

        let repositoryAnalysisResponse;
        try{
            let repositoryDetails: RepositoryDetails = new RepositoryDetails();
            repositoryDetails.id = sourceRepositoryDetails.repositoryId;
            repositoryDetails.defaultbranch = !!sourceRepositoryDetails.branch ? sourceRepositoryDetails.branch : RepoAnalysisConstants.Master;
            repositoryDetails.type = RepositoryProvider.Github;

            let repositoryAnalysisRequestBody = new RepositoryAnalysisRequest;
            repositoryAnalysisRequestBody.Repository = repositoryDetails;

            repositoryAnalysisResponse = await this.portalExtensionClient.getRepositoryAnalysis(repositoryAnalysisRequestBody);
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

            //Process only for VSCode Supported Languages
            if(Object.keys(SupportedLanguage).indexOf(analysis.language.toUpperCase()) > -1){
                let settings: LanguageSettings = new LanguageSettings();
                settings.language = analysis.language;
                settings.buildTargetName = analysis.buildTargetName;
                settings.deployTargetName = analysis.deployTargetName;
                settings.buildSettings = new BuildSettings();

                if (analysis.language === SupportedLanguage.NODE) {
                    let nodeBuildSettings = new NodeBuildSettings();
                    if (analysis.buildTargetName === RepoAnalysisConstants.Gulp) {
                        if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysisConstants.GulpFilePath]) {
                            nodeBuildSettings.gulpFilePath = analysis.buildSettings[RepoAnalysisConstants.GulpFilePath];
                        }
                    }
                    if (analysis.buildTargetName === RepoAnalysisConstants.Grunt) {
                        if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysisConstants.GruntFilePath]) {
                            nodeBuildSettings.gruntFilePath = analysis.buildSettings[RepoAnalysisConstants.GruntFilePath];
                        }
                    }
                    settings.buildSettings = nodeBuildSettings;
                }
                else if (analysis.language === SupportedLanguage.PYTHON) {
                    let pythonBuildSettings = new PythonBuildSettings();
                    if (analysis.buildTargetName === RepoAnalysisConstants.Django) {
                        if (!!analysis.buildSettings && !!analysis.buildSettings[RepoAnalysisConstants.RequirementsFilePath]) {
                            pythonBuildSettings.requirementsFilePath = analysis.buildSettings[RepoAnalysisConstants.RequirementsFilePath];
                        }
                    }
                    settings.buildSettings = pythonBuildSettings;
                }
                parameters.languageSettingsList.push(settings);
            }
        });
        return parameters;;
    }
}
