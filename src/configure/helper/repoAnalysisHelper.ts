import { CodeRepository, SourceRepository } from "azureintegration-repoanalysis-client-internal";
import * as path from 'path';
import { ModaRepositoryAnalysisClient } from '../clients/modaRepositoryAnalysisClient';
import { PortalExtensionRepositoryAnalysisClient } from "../clients/portalExtensionRepositoryAnalysisClient";
import { IRepositoryAnalysisClient } from '../clients/repositoryAnalyisClient';
import { AzureSession, GitRepositoryParameters, RepositoryAnalysisApplicationSettings, RepositoryAnalysisParameters, RepositoryProvider, SupportedLanguage } from "../model/models";
import { RepoAnalysisConstants } from "../resources/constants";
import { IServiceUrlDefinition, RemoteServiceUrlHelper, ServiceFramework } from './remoteServiceUrlHelper';

export class RepoAnalysisHelper {
    private azureSession: AzureSession;
    private githubPatToken?: string;
    constructor(azureSession: AzureSession, githubPatToken?: string) {
        this.azureSession = azureSession;
        this.githubPatToken = githubPatToken;
    }

    public async getRepositoryAnalysis(sourceRepositoryDetails: GitRepositoryParameters, workspacePath: string): Promise<RepositoryAnalysisParameters> {

        let repositoryAnalysisResponse;
        try {
            const serviceDefinition = await RemoteServiceUrlHelper.getRepositoryAnalysisDefinition();
            const client = this.getClient(serviceDefinition);

            const repositoryDetails: CodeRepository = {} as CodeRepository;
            repositoryDetails.id = sourceRepositoryDetails.repositoryId;
            repositoryDetails.defaultBranch = !!sourceRepositoryDetails.branch ? sourceRepositoryDetails.branch : RepoAnalysisConstants.Master;
            repositoryDetails.type = RepositoryProvider.Github;

            let repositoryAnalysisRequestBody = {} as SourceRepository;
            repositoryAnalysisRequestBody.repository = repositoryDetails;
            repositoryAnalysisRequestBody.workingDirectory = workspacePath;
            repositoryAnalysisRequestBody.repository.authorizationInfo = {
                scheme: "Token",
                parameters: {
                    accesstoken: this.githubPatToken
                }
            };
            repositoryAnalysisResponse = await client.getRepositoryAnalysis(repositoryAnalysisRequestBody);
            if (!!repositoryAnalysisResponse && repositoryAnalysisResponse.length === 0) {
                return null;
            }
        }
        catch (e) {
            //Return empty if Repo Analysis fails
            return null;
        }

        let parameters: RepositoryAnalysisParameters = new RepositoryAnalysisParameters();
        parameters.applicationSettingsList = [];
        repositoryAnalysisResponse.applicationSettingsList.forEach((analysis) => {

            //Process only for VSCode Supported Languages
            if (Object.keys(SupportedLanguage).indexOf(analysis.language.toUpperCase()) > -1) {
                let applicationSettings: RepositoryAnalysisApplicationSettings = new RepositoryAnalysisApplicationSettings();
                applicationSettings.language = analysis.language;

                if (!!analysis.settings) {
                    if (!!analysis.settings.workingDirectory) {
                        applicationSettings.settings.workingDirectory = analysis.settings.workingDirectory.split('\\').join('/');
                    }
                    if (!!analysis.buildTargetName) {
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
                        } else {
                            applicationSettings.settings = analysis.settings;
                        }
                    }
                    if (!!analysis.deployTargetName) {
                        applicationSettings.deployTargetName = analysis.deployTargetName;
                        if (analysis.deployTargetName === RepoAnalysisConstants.AzureFunctions) {
                            applicationSettings.settings.azureFunctionsHostFilePath = analysis.settings[RepoAnalysisConstants.HostFilePath];
                            applicationSettings.settings.azureFunctionsHostFileDirectory = path.dirname(analysis.settings[RepoAnalysisConstants.HostFilePath]);
                        }
                    }

                }
                parameters.applicationSettingsList.push(applicationSettings);
            }
        });
        return parameters;
    }

    private GetRelativePath(workingDirectory: string, filePath: string): string {
        return path.relative(workingDirectory, filePath).split(path.sep).join('/');
    }

    private getClient(serviceDefinition: IServiceUrlDefinition): IRepositoryAnalysisClient {
        let client = null;
        if (serviceDefinition.serviceFramework === ServiceFramework.Vssf) {
            client = new PortalExtensionRepositoryAnalysisClient(serviceDefinition.serviceUrl, this.azureSession.credentials);
        } else {
            client = new ModaRepositoryAnalysisClient(serviceDefinition.serviceUrl, this.githubPatToken);
        }
        return client;
    }
}
