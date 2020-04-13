import * as path from 'path';
import { PortalExtensionClient } from "../clients/portalExtensionClient";
import { AzureSession, GitRepositoryParameters, RepositoryAnalysisApplicationSettings, RepositoryAnalysisParameters, RepositoryAnalysisRequest, RepositoryDetails, RepositoryProvider, SupportedLanguage } from "../model/models";
import { RepoAnalysisConstants } from "../resources/constants";

export class RepoAnalysisHelper {
    private portalExtensionClient: PortalExtensionClient;

    constructor(azureSession: AzureSession) {
        this.portalExtensionClient = new PortalExtensionClient(azureSession.credentials);
    }

    public async getRepositoryAnalysis(sourceRepositoryDetails: GitRepositoryParameters, workspacePath: string): Promise<RepositoryAnalysisParameters> {

        //As of now this solution has support only for github
        if (sourceRepositoryDetails.repositoryProvider != RepositoryProvider.Github) {
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
            repositoryAnalysisRequestBody.WorkingDirectory = workspacePath;

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
        parameters.repositoryAnalysisApplicationSettingsList = [];
        repositoryAnalysisResponse.applicationSettingsList.forEach((analysis) => {

            //Process only for VSCode Supported Languages
            if(Object.keys(SupportedLanguage).indexOf(analysis.language.toUpperCase()) > -1) {
                let applicationSettings: RepositoryAnalysisApplicationSettings = new RepositoryAnalysisApplicationSettings();
                applicationSettings.language = analysis.language;

                if(!!analysis.settings){
                    if(!!analysis.settings.workingDirectory){
                        applicationSettings.settings.workingDirectory = analysis.settings.workingDirectory.split('\\').join('/');
                    }
                    if(!!analysis.buildTargetName) {
                        applicationSettings.buildTargetName = analysis.buildTargetName;
                        if (analysis.language === SupportedLanguage.NODE) {
                            applicationSettings.settings.nodePackageFilePath = analysis.settings[RepoAnalysisConstants.PackageFilePath];
                            applicationSettings.settings.nodePackageFileDirectory = path.dirname(analysis.settings[RepoAnalysisConstants.PackageFilePath]);
                            if (analysis.buildTargetName === RepoAnalysisConstants.Gulp && !!analysis.settings[RepoAnalysisConstants.GulpFilePath]) {
                                applicationSettings.settings.nodeGulpFilePath = this.GetRelativePath(
                                    applicationSettings.settings.workingDirectory, analysis.settings[RepoAnalysisConstants.GulpFilePath]);
                            }
                            else if (analysis.buildTargetName === RepoAnalysisConstants.Grunt && !!analysis.settings[RepoAnalysisConstants.GruntFilePath]) {
                                applicationSettings.settings.nodeGruntFilePath = this.GetRelativePath(
                                    applicationSettings.settings.workingDirectory, analysis.settings[RepoAnalysisConstants.GruntFilePath]);
                            }
                        }
                        else if (analysis.language === SupportedLanguage.PYTHON) {
                            if (!!analysis.settings[RepoAnalysisConstants.RequirementsFilePath]) {
                                applicationSettings.settings.pythonRequirementsFilePath = this.GetRelativePath(
                                    applicationSettings.settings.workingDirectory, analysis.settings[RepoAnalysisConstants.RequirementsFilePath]);
                                applicationSettings.settings.pythonRequirementsFileDirectory = path.dirname(analysis.settings[RepoAnalysisConstants.RequirementsFilePath]);
                            }
                        }
                    }
                    if(!!analysis.settings && !!analysis.deployTargetName) {
                        applicationSettings.deployTargetName = analysis.deployTargetName;
                        if(analysis.deployTargetName == RepoAnalysisConstants.AzureFunctions){
                            applicationSettings.settings.azureFunctionsHostFilePath = analysis.settings[RepoAnalysisConstants.HostFilePath];
                            applicationSettings.settings.azureFunctionsHostFileDirectory = path.dirname(analysis.settings[RepoAnalysisConstants.HostFilePath]);
                        }
                    }
                }
                parameters.repositoryAnalysisApplicationSettingsList.push(applicationSettings);
            }
        });
        return parameters;
    }

    private GetRelativePath(workingDirectory: string, filePath: string): string{
        return path.relative(workingDirectory, filePath).split(path.sep).join('/');
    }
}
