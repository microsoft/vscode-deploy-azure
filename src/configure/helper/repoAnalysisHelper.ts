import { PortalExtensionClient } from "../clients/portalExtensionClient";
import { AzureSession, SupportedLanguage, GitRepositoryParameters, RepositoryAnalysisRequest, RepositoryProvider, RepositoryAnalysisParameters, ApplicationSettings, extensionVariables, RepositoryDetails, BuildAndDeploySettings } from "../model/models";
import { RepoAnalysisConstants } from "../resources/constants";
import * as path from 'path';

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
            if(Object.keys(SupportedLanguage).indexOf(analysis.language.toUpperCase()) > -1) {
                let applicationSettings: ApplicationSettings = new ApplicationSettings();
                applicationSettings.language = analysis.language;
                applicationSettings.settings = new BuildAndDeploySettings();

                if(!!analysis.settings && !!analysis.buildTargetName) {
                    applicationSettings.buildTargetName = analysis.buildTargetName;
                    if (analysis.language === SupportedLanguage.NODE) {
                        if (analysis.buildTargetName === RepoAnalysisConstants.Gulp && !!analysis.settings[RepoAnalysisConstants.GulpFilePath]) {
                            applicationSettings.settings.nodeGulpFilePath = analysis.Settings[RepoAnalysisConstants.GulpFilePath];
                        }
                        if (analysis.buildTargetName === RepoAnalysisConstants.Grunt && !!analysis.settings[RepoAnalysisConstants.GruntFilePath]) {
                            applicationSettings.settings.nodeGruntFilePath = analysis.Settings[RepoAnalysisConstants.GruntFilePath];
                        }
                    }
                    else if (analysis.language === SupportedLanguage.PYTHON) {
                        if (!!analysis.settings[RepoAnalysisConstants.RequirementsFilePath]) {
                            applicationSettings.settings.pythonRequirementsFilePath = analysis.settings[RepoAnalysisConstants.RequirementsFilePath];
                        }
                    }
                }
                else if(!!analysis.settings && !!analysis.deployTargetName) {
                    applicationSettings.deployTargetName = analysis.deployTargetName;
                    if(analysis.deployTargetName == RepoAnalysisConstants.AzureFunctions){
                        applicationSettings.settings.azureFunctionsHostFilePath = analysis.settings[RepoAnalysisConstants.HostFilePath];
                        applicationSettings.workingDirectory = path.dirname(analysis.settings[RepoAnalysisConstants.HostFilePath]);
                    }
                }
                parameters.applicationSettingsList.push(applicationSettings);
            }
        });
        return parameters;;
    }
}
