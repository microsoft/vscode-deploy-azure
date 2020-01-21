import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import * as path from 'path';
import * as Q from 'q';
import { AzureConnectionType, extensionVariables, RepositoryProvider, TargetKind, TargetResourceType, WizardInputs, SupportedLanguage, RepositoryAnalysisParameters } from '../model/models';
import { PipelineTemplate, PreDefinedDataSourceIds, TemplateAssetType, TemplateParameterType } from '../model/templateModels';
import { PipelineTemplateLabels, RepoAnalysis } from '../resources/constants';
import { Messages } from '../resources/messages';

export async function analyzeRepoAndListAppropriatePipeline(repoPath: string, repositoryProvider: RepositoryProvider, repoAnalysisParameters: RepositoryAnalysisParameters,  targetResource?: GenericResource): Promise<PipelineTemplate[]> {
    let analysisResult: AnalysisResult = new AnalysisResult();

    //If Repo analysis fails then we'll go with the basic existing analysis
    if (repositoryProvider === RepositoryProvider.Github && !!repoAnalysisParameters) {
        analysisResult.isFunctionApp = repoAnalysisParameters.deployTargets.indexOf(RepoAnalysis.AzureFunctions) > -1 ? true : false;
        analysisResult.languages = repoAnalysisParameters.languages;
    }
    else {
        analysisResult = await analyzeRepo(repoPath);
    }

    let templateList: { [key: string]: PipelineTemplate[] } = {};
    switch (repositoryProvider) {
        case RepositoryProvider.AzureRepos:
            templateList = azurePipelineTemplates;
            break;
        case RepositoryProvider.Github:
            templateList = extensionVariables.enableGitHubWorkflow ? githubWorklowTemplates : azurePipelineTemplates;
            break;
        default:
            throw new Error(Messages.cannotIdentifyRespositoryDetails);
    }

    let templateResult: PipelineTemplate[] = [];
    analysisResult.languages.forEach((language) => {
        switch (language) {
            case SupportedLanguage.DOCKER:
                if (templateList[SupportedLanguage.DOCKER] && templateList[SupportedLanguage.DOCKER].length > 0) {
                    templateResult = templateResult.concat(templateList[SupportedLanguage.DOCKER]);
                }
                break;
            case SupportedLanguage.NODE:
                if (templateList[SupportedLanguage.NODE] && templateList[SupportedLanguage.NODE].length > 0) {
                    templateResult = templateResult.concat(templateList[SupportedLanguage.NODE]);
                }
                break;
            case SupportedLanguage.PYTHON:
                if (templateList[SupportedLanguage.PYTHON] && templateList[SupportedLanguage.PYTHON].length > 0) {
                    templateResult = templateResult.concat(templateList[SupportedLanguage.PYTHON]);
                }
                break;
            case SupportedLanguage.DOTNETCORE:
                if (templateList[SupportedLanguage.DOTNETCORE] && templateList[SupportedLanguage.DOTNETCORE].length > 0 ) {
                    templateResult = templateResult.concat(templateList[SupportedLanguage.DOTNETCORE]);
                }
                break;
            case SupportedLanguage.NONE:
                if (templateList[SupportedLanguage.NONE] && templateList[SupportedLanguage.NONE].length > 0) {
                    templateResult = templateResult.concat(templateList[SupportedLanguage.NONE]);
                }
                break;
            default:
                break;
        }
    });

    if (templateResult.length < 1 && templateList[SupportedLanguage.NONE] && templateList[SupportedLanguage.NONE].length > 0) {
        templateResult = templateList[SupportedLanguage.NONE];
    }

    if(analysisResult.isFunctionApp) {
        switch(repositoryProvider) {
            case RepositoryProvider.AzureRepos:
                templateResult = azurePipelineTargetBasedTemplates[AzureTarget.FunctionApp].concat(templateResult);
                break;
            case RepositoryProvider.Github:
                templateResult = extensionVariables.enableGitHubWorkflow ? githubWorkflowTargetBasedTemplates[AzureTarget.FunctionApp].concat(templateResult) : azurePipelineTargetBasedTemplates[AzureTarget.FunctionApp].concat(templateResult);
                break;
            default:
                break;
        }
    }

    templateResult = targetResource && !!targetResource.type ? templateResult.filter((template) => !template.targetType || template.targetType.toLowerCase() === targetResource.type.toLowerCase()) : templateResult;
    templateResult = targetResource && !!targetResource.kind ? templateResult.filter((template) => !template.targetKind || template.targetKind.toLowerCase() === targetResource.kind.toLowerCase()) : templateResult;
    templateResult = templateResult.filter((pipelineTemplate) => pipelineTemplate.enabled);

    // remove duplicate named template:
    templateResult = removeDuplicates(templateResult);
    return templateResult;
}

export function getPipelineTemplatesForAllWebAppKind(repositoryProvider: RepositoryProvider, label: string, language: string, targetKind: TargetKind): PipelineTemplate[] {
    let pipelineTemplates: PipelineTemplate[] = [];

    if (repositoryProvider === RepositoryProvider.Github && extensionVariables.enableGitHubWorkflow) {
        pipelineTemplates = githubWorklowTemplates[language];
        if (isFunctionAppType(targetKind)) {
            pipelineTemplates = pipelineTemplates.concat(githubWorkflowTargetBasedTemplates[AzureTarget.FunctionApp]);
        }
    }
    else {
        pipelineTemplates = azurePipelineTemplates[language];
        if (isFunctionAppType(targetKind)) {
            pipelineTemplates = pipelineTemplates.concat(azurePipelineTargetBasedTemplates[AzureTarget.FunctionApp]);
        }
    }

    return pipelineTemplates.filter((template) => {
        return template.label.toLowerCase() === label.toLowerCase() && template.targetType === TargetResourceType.WebApp && template.language === language;
    });
}

export async function renderContent(templateFilePath: string, context: WizardInputs): Promise<string> {
    let deferred: Q.Deferred<string> = Q.defer();
    fs.readFile(templateFilePath, { encoding: "utf8" }, async (error, data) => {
        if (error) {
            throw new Error(error.message);
        }
        else {
            let fileContent = Mustache.render(data, context);
            deferred.resolve(fileContent);
        }
    });

    return deferred.promise;
}

async function analyzeRepo(repoPath: string): Promise<AnalysisResult> {
    let deferred: Q.Deferred<AnalysisResult> = Q.defer();
    fs.readdir(repoPath, (err, files: string[]) => {
        let result: AnalysisResult = new AnalysisResult();
        result.languages = [];
        result.languages = isDockerApp(files) ? result.languages.concat(SupportedLanguage.DOCKER) : result.languages;
        result.languages = isNodeRepo(files) ? result.languages.concat(SupportedLanguage.NODE) : result.languages;
        result.languages = isPythonRepo(files) ? result.languages.concat(SupportedLanguage.PYTHON) : result.languages;
        result.languages = isDotnetCoreRepo(files) ? result.languages.concat(SupportedLanguage.DOTNETCORE) : result.languages;

        result.isFunctionApp = err ? true : isFunctionApp(files),

            deferred.resolve(result);
    });

    return deferred.promise;
}

function isDotnetCoreRepo(files: string[]): boolean {
    return files.some((file) => {
        return file.toLowerCase().endsWith("sln") || file.toLowerCase().endsWith("csproj") || file.toLowerCase().endsWith("fsproj");
    });
}

function isNodeRepo(files: string[]): boolean {
    let nodeFilesRegex = '\\.ts$|\\.js$|package\\.json$|node_modules';
    return files.some((file) => {
        let result = new RegExp(nodeFilesRegex).test(file.toLowerCase());
        return result;
    });
}

function isPythonRepo(files: string[]): boolean {
    let pythonRegex = '.py$';
    return files.some((file) => {
        let result = new RegExp(pythonRegex).test(file.toLowerCase());
        return result;
    });
}

function isDockerApp(files: string[]): boolean {
    return files.some((file) => {
        return file.toLowerCase().endsWith("dockerfile");
    });
}

function isFunctionApp(files: string[]): boolean {
    return files.some((file) => {
        return file.toLowerCase().endsWith("host.json");
    });
}

function isFunctionAppType(targetKind: TargetKind): boolean {
    return targetKind === TargetKind.FunctionApp || targetKind === TargetKind.FunctionAppLinux || targetKind === TargetKind.FunctionAppLinuxContainer;
}

function removeDuplicates(templateList: PipelineTemplate[]): PipelineTemplate[] {
    let templateMap: Map<string, PipelineTemplate> = new Map<string, PipelineTemplate>();
    let tempList = templateList;
    templateList = [];
    tempList.forEach((template) => {
        if (!templateMap[template.label]) {
            templateMap[template.label] = template;
            templateList.push(template);
        }
    });

    return templateList;
}

export class AnalysisResult {
    public languages: SupportedLanguage[];
    public isFunctionApp: boolean = false;
    // public isContainerized: boolean;
}

export enum AzureTarget {
    FunctionApp = 'Microsoft.Web/sites-functionapp'
}

let azurePipelineTemplates: { [key in SupportedLanguage]: PipelineTemplate[] } =
{
    'none': [
        {
            label: PipelineTemplateLabels.SimpleApplicationToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/simpleWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.SimpleApplicationToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/simpleLinuxWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        }
    ],
    'node': [
        {
            label: PipelineTemplateLabels.NodeJSWithNpmToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejs.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithGulpToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGulp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithGruntToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGrunt.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithAngularToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithAngular.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithWebpackToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithWebpack.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithNpmToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSWithGulpToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGulpLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSWithGruntToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGruntLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSWithAngularToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithAngularLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSWithWebpackToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithWebpackLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        }
    ],
    'python': [
        {
            label: 'Python to Linux Web App on Azure',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxWebApp.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: 'Build and Test Python Django App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonDjango.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.None,
            targetKind: null,
            enabled: true,
            parameters: [],
            azureConnectionType: AzureConnectionType.None
        }
    ],
    'dotnetcore': [
        {
            label: PipelineTemplateLabels.DotNetCoreWebAppToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreWindowsWebApp.yml'),
            language: SupportedLanguage.DOTNETCORE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.DotNetCoreWebAppToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreLinuxWebApp.yml'),
            language: SupportedLanguage.DOTNETCORE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        }
    ],
    'docker': [
        {
            label: 'Containerized application to AKS',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/AksWithReuseACR.yml'),
            language: SupportedLanguage.DOCKER,
            targetType: TargetResourceType.AKS,
            targetKind: null,
            enabled: false,
            parameters: [
                {
                    "name": "cluster",
                    "displayName": "Select Azure Kubernetes cluster to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.AKS
                },
                {
                    "name": "acr",
                    "displayName": "Select Azure Container Registry to store docker image",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.ACR
                }
            ],
            assets: [
                {
                    "id": "aKSEndpoint",
                    "type": TemplateAssetType.AKSKubeConfigServiceConnection
                },
                {
                    "id": "aCREndpoint",
                    "type": TemplateAssetType.ACRServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        }
    ]
};

let githubWorklowTemplates: { [key in SupportedLanguage]: PipelineTemplate[] } = {
    'node': [
        {
            label: PipelineTemplateLabels.NodeJSWithNpmToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsOnWindows.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithNpmToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsOnLinux.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSWithGulpToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGulpOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithGulpToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGulpOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSWithGruntToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGruntOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithGruntToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGruntOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSWithAngularToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithAngularOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithAngularToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithAngularOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSWithWebpackToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithWebpackOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.NodeJSWithWebpackToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithWebpackOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        }
    ],
    'none': [
        {
            label: PipelineTemplateLabels.SimpleApplicationToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/simpleWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.WindowsApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.WindowsApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile
        },
        {
            label: PipelineTemplateLabels.SimpleApplicationToAppService,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/simpleWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        }
    ],
    'python': [
        {
            label: 'Python to Linux Web App on Azure',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/pythonLinuxWebApp.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.LinuxApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure webapp to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
    ],
    'dotnetcore': [],
    'docker': []
};

const azurePipelineTargetBasedTemplates: { [key in AzureTarget]: PipelineTemplate[] } =
{
    'Microsoft.Web/sites-functionapp': [
        {
            label: PipelineTemplateLabels.NodeJSFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWindowsFunctionApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.FunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxFunctionApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinux,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxFunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxFunctionApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.DotNetCoreFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreWindowsFunctionApp.yml'),
            language: SupportedLanguage.DOTNETCORE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionApp,
            enabled: false,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.FunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.DotNetCoreFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreLinuxFunctionApp.yml'),
            language: SupportedLanguage.DOTNETCORE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinux,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxFunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.DotNetCoreFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreLinuxFunctionApp.yml'),
            language: SupportedLanguage.DOTNETCORE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.PythonFunctionAppToLinuxAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxFunctionApp.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinux,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxFunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.PythonFunctionAppToLinuxAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxFunctionApp.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
    ]
};

const githubWorkflowTargetBasedTemplates: { [key in AzureTarget]: PipelineTemplate[] } =
{
    'Microsoft.Web/sites-functionapp': [
        {
            label: PipelineTemplateLabels.NodeJSFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWindowsFunctionApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionApp,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.FunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsLinuxFunctionApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinux,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxFunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.NodeJSFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsLinuxFunctionApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.PythonFunctionAppToLinuxAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/pythonLinuxFunctionApp.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinux,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxFunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        },
        {
            label: PipelineTemplateLabels.PythonFunctionAppToLinuxAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/pythonLinuxFunctionApp.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            parameters: [
                {
                    "name": "webapp",
                    "displayName": "Select the target Azure Function to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.LinuxContainerFunctionApp
                }
            ],
            assets: [
                {
                    "id": "endpoint",
                    "type": TemplateAssetType.AzureARMServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal
        }
    ]
};
