import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { RepositoryAnalysis } from 'azureintegration-repoanalysis-client-internal';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import * as path from 'path';
import * as Q from 'q';
import { TemplateServiceClientFactory } from '../clients/TemplateServiceClientFactory';
import { ExtendedPipelineTemplate } from '../model/Contracts';
import { AzureConnectionType, AzureSession, extensionVariables, GitRepositoryParameters, MustacheContext, PipelineType, RepositoryProvider, SupportedLanguage, TargetKind, TargetResourceType } from '../model/models';
import { LocalPipelineTemplate, PipelineTemplate, PreDefinedDataSourceIds, RemotePipelineTemplate, TemplateAssetType, TemplateInfo, TemplateParameterType, TemplateType } from '../model/templateModels';
import { PipelineTemplateLabels, RepoAnalysisConstants } from '../resources/constants';
import { Messages } from '../resources/messages';
import { TelemetryKeys } from '../resources/telemetryKeys';
import { TracePoints } from '../resources/tracePoints';
import { MustacheHelper } from './mustacheHelper';
import { telemetryHelper } from './telemetryHelper';

const Layer: string = 'templateHelper';
export async function mergingRepoAnalysisResults(sourceRepository: GitRepositoryParameters, repoAnalysisParameters: RepositoryAnalysis): Promise<AnalysisResult> {
    let localRepoAnalysisResult = await analyzeRepo(sourceRepository.localPath);
    let analysisResult = localRepoAnalysisResult;

    //If Repo analysis fails then we'll go with the basic existing analysis
    if (sourceRepository.repositoryProvider === RepositoryProvider.Github && !!repoAnalysisParameters && !!repoAnalysisParameters.applicationSettingsList) {
        analysisResult = new AnalysisResult();
        repoAnalysisParameters.applicationSettingsList.forEach((settings) => {
            analysisResult.languages.push(settings.language as SupportedLanguage);

            //Check if Azure:Functions is value of any deployTargetName property
            analysisResult.isFunctionApp =
                analysisResult.isFunctionApp || settings.deployTargetName === RepoAnalysisConstants.AzureFunctions ? true : false;
        });

        //Languages not supported by RepoAnalysisService should be considered and taken from LocalRepoAnalysis
        localRepoAnalysisResult.languages.forEach((language) => {
            if (analysisResult.languages.indexOf(language) === -1) {
                analysisResult.languages.push(language);
            }
        });

        if (analysisResult.languages.length === 0) {
            analysisResult.languages.push(SupportedLanguage.NONE);
        }
    }
    return analysisResult;
}

export function getTargetType(template: TemplateInfo): TargetResourceType {
    if (template.attributes.deployTarget.toLowerCase().includes("webapp")) {
        return TargetResourceType.WebApp;
    } else if (template.attributes.deployTarget === "Azure:AKS") {
        return TargetResourceType.AKS;
    }
    return TargetResourceType.None;
}

export function getTargetKind(template: TemplateInfo): TargetKind {
    var targetKind: TargetKind;
    if (template.attributes.deployTarget.toLowerCase().includes("webapp")) {
        if (template.attributes.deployTarget.toLowerCase().includes("container")) {
            targetKind = TargetKind.LinuxContainerApp;
        } else if (template.attributes.deployTarget.toLowerCase().includes("linux")) {
            targetKind = TargetKind.LinuxApp;
        } else if (template.attributes.deployTarget.toLowerCase().includes("windows")) {
            targetKind = TargetKind.WindowsApp;
        }
    }
    else {
        targetKind = null;
    }
    return targetKind;
}

export function uniqueValues(value, index, self) {
    return self.indexOf(value) === index;
}

export async function analyzeRepoAndListAppropriatePipeline(sourceRepository: GitRepositoryParameters, repoAnalysisParameters: RepositoryAnalysis, targetResource?: GenericResource): Promise<LocalPipelineTemplate[]> {

    let analysisResult = await mergingRepoAnalysisResults(sourceRepository, repoAnalysisParameters);

    let templateList: { [key: string]: LocalPipelineTemplate[] } = {};
    switch (sourceRepository.repositoryProvider) {
        case RepositoryProvider.AzureRepos:
            templateList = azurePipelineTemplates;
            break;
        case RepositoryProvider.Github:
            templateList = extensionVariables.enableGitHubWorkflow ? githubWorklowTemplates : azurePipelineTemplates;
            break;
        default:
            throw new Error(Messages.cannotIdentifyRespositoryDetails);
    }


    let templateResult: LocalPipelineTemplate[] = [];
    let uniqueLanguages = (analysisResult.languages).filter(this.uniqueValues);

    uniqueLanguages.forEach((language) => {
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
                if (templateList[SupportedLanguage.DOTNETCORE] && templateList[SupportedLanguage.DOTNETCORE].length > 0) {
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

    if (analysisResult.isFunctionApp) {
        switch (sourceRepository.repositoryProvider) {
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

    return templateResult;
}

async function convertToPipelineTemplate(remoteTemplates: TemplateInfo[]): Promise<PipelineTemplate[]> {
    const pipelineTemplates: PipelineTemplate[] = [];
    if (!!remoteTemplates) {
        remoteTemplates.forEach((templateInfo: TemplateInfo) => {
            const remoteTemplate: RemotePipelineTemplate = {
                label: templateInfo.templateLabel,
                targetType: getTargetType(templateInfo),
                targetKind: getTargetKind(templateInfo),
                templateType: TemplateType.REMOTE,
                language: templateInfo.attributes.language,
                id: templateInfo.templateId,
                templateWeight: templateInfo.templateWeight,
                workingDirectory: templateInfo.workingDirectory,
                description: templateInfo.templateDescription,
            };
            pipelineTemplates.push(remoteTemplate);
        });
    }
    return pipelineTemplates;
}

export async function getFilteredTemplates(azureSession: AzureSession, resourceType: string, githubPatToken?: string): Promise<TemplateInfo[]> {

    const client = await TemplateServiceClientFactory.getClient(azureSession.credentials, githubPatToken);
    let filteredTemplates: TemplateInfo[];
    switch (resourceType) {
        case TargetResourceType.AKS:
            await telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
                filteredTemplates = await client.getTemplatesInfoByFilter("docker", "Azure:AKS");
            }, TelemetryKeys.TemplateServiceDuration);
            return filteredTemplates;
        default:
            return null;
    }
}

export async function getTemplates(azureSession: AzureSession, repoAnalysisParameters: RepositoryAnalysis, githubPatToken?: string) {
    const client = await TemplateServiceClientFactory.getClient(azureSession.credentials, githubPatToken);
    let templates: TemplateInfo[];
    await telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
        templates = await client.getTemplates(repoAnalysisParameters);
    }, TelemetryKeys.TemplateServiceDuration);
    return templates;
}

export async function analyzeRepoAndListAppropriatePipeline2(azureSession: AzureSession, sourceRepository: GitRepositoryParameters, pipelineType: PipelineType, repoAnalysisParameters: RepositoryAnalysis, githubPatToken?: string, resource?: GenericResource): Promise<PipelineTemplate[]> {

    let pipelineTemplates: PipelineTemplate[] = [];
    let remoteTemplates: TemplateInfo[] = [];
    let localPipelineTemplates: LocalPipelineTemplate[] = await this.analyzeRepoAndListAppropriatePipeline(sourceRepository, repoAnalysisParameters);

    if (pipelineType === PipelineType.GitHubPipeline) {
        try {
            if (!!resource) {
                localPipelineTemplates = [];
                remoteTemplates = await getFilteredTemplates(azureSession, resource.type, githubPatToken);
            }
            else if (repoAnalysisParameters && repoAnalysisParameters.applicationSettingsList) {
                remoteTemplates = await getTemplates(azureSession, repoAnalysisParameters, githubPatToken);
            }
            pipelineTemplates = await convertToPipelineTemplate(remoteTemplates);
            pipelineTemplates = pipelineTemplates.concat(localPipelineTemplates);
            // sorted by weight
            pipelineTemplates = pipelineTemplates.sort((a, b) => {
                if (a.templateWeight < b.templateWeight) { return 1; }
                else { return -1; }
            });
            return pipelineTemplates;
        }
        catch (err) {
            pipelineTemplates = [];
            telemetryHelper.logError(Layer, TracePoints.TemplateServiceCallFailed, err);
            return null;
        }
    }
    else {
        return localPipelineTemplates;
    }
}

export async function getTemplateParameters(azureSession: AzureSession, templateId: string, githubPatToken?: string): Promise<ExtendedPipelineTemplate> {
    let parameters: ExtendedPipelineTemplate;
    try {
        let serviceClient = await TemplateServiceClientFactory.getClient(azureSession.credentials, githubPatToken);
        parameters = await serviceClient.getTemplateParameters(templateId);
        return parameters;
    }
    catch (e) {
        telemetryHelper.logError(Layer, TracePoints.UnableToGetTemplateParameters, e);
        throw new Error(Messages.UnableToGetTemplateParameters);
    }

}

export function getPipelineTemplatesForAllWebAppKind(repositoryProvider: RepositoryProvider, label: string, language: string, targetKind: TargetKind): LocalPipelineTemplate[] {
    let pipelineTemplates: LocalPipelineTemplate[] = [];

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

export async function renderContent(templateFilePath: string, context: MustacheContext): Promise<string> {
    let deferred: Q.Deferred<string> = Q.defer();
    fs.readFile(templateFilePath, { encoding: "utf8" }, async (error, data) => {
        if (error) {
            throw new Error(error.message);
        }
        else {
            let updatedContext: MustacheContext;
            updatedContext = { ...MustacheHelper.getHelperMethods(), ...context };
            let fileContent = Mustache.render(data, updatedContext);
            deferred.resolve(fileContent);
        }
    });

    return deferred.promise;
}

export function getDockerPort(repoPath: string, relativeDockerFilePath?: string): string {
    let dockerfilePath = relativeDockerFilePath;
    if (!dockerfilePath) {
        let files = fs.readdirSync(repoPath);
        files.some((fileName) => { if (fileName.toLowerCase().endsWith('dockerfile')) { dockerfilePath = fileName; return true; } return false; });
        if (!dockerfilePath) {
            return null;
        }
    }

    try {
        let dockerContent = fs.readFileSync(path.join(repoPath, dockerfilePath), 'utf8');
        let index = dockerContent.toLowerCase().indexOf('expose ');
        if (index !== -1) {
            let temp = dockerContent.substring(index + 'expose '.length);
            let ports = temp.substr(0, temp.indexOf('\n')).split(' ').filter(Boolean);
            if (ports.length) {
                return ports[0];
            }
        }
        return null;
    }
    catch (err) {
        telemetryHelper.logError(Layer, TracePoints.ReadingDockerFileFailed, err);
    }

    return null;
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

export function isFunctionAppType(targetKind: TargetKind): boolean {
    return targetKind === TargetKind.FunctionApp || targetKind === TargetKind.FunctionAppLinux || targetKind === TargetKind.FunctionAppLinuxContainer;
}

export class AnalysisResult {
    public languages: SupportedLanguage[] = [];
    public isFunctionApp: boolean = false;
    // public isContainerized: boolean;
}

export enum AzureTarget {
    FunctionApp = 'Microsoft.Web/sites-functionapp'
}

let azurePipelineTemplates: { [key in SupportedLanguage]: LocalPipelineTemplate[] } =
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL,
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        },
        {
            label: 'Build and Test Python Django App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonDjango.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.None,
            targetKind: null,
            enabled: true,
            parameters: [],
            azureConnectionType: AzureConnectionType.None,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "name": "aksCluster",
                    "displayName": "Select Azure Kubernetes cluster to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.AKS
                },
                {
                    "name": "containerRegistry",
                    "displayName": "Select Azure Container Registry to store docker image",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.ACR
                },
                {
                    "name": "containerPort",
                    "displayName": null,
                    "type": TemplateParameterType.String,
                    "dataSourceId": PreDefinedDataSourceIds.RepoAnalysis,
                    "defaultValue": '80'
                }
            ],
            assets: [
                {
                    "id": "kubernetesServiceConnection ",
                    "type": TemplateAssetType.AKSKubeConfigServiceConnection
                },
                {
                    "id": "containerRegistryServiceConnection",
                    "type": TemplateAssetType.ACRServiceConnection
                }
            ],
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        }
    ],
    'dotnet': []
};

let githubWorklowTemplates: { [key in SupportedLanguage]: LocalPipelineTemplate[] } = {
    'docker': [
        {
            label: 'Containerized application to AKS',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/AksWithReuseACR.yml'),
            language: SupportedLanguage.DOCKER,
            targetType: TargetResourceType.AKS,
            targetKind: null,
            enabled: true,
            parameters: [
                {
                    "name": "aksCluster",
                    "displayName": "Select Azure Kubernetes cluster to deploy your application",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.AKS
                },
                {
                    "name": "containerRegistry",
                    "displayName": "Select Azure Container Registry to store docker image",
                    "type": TemplateParameterType.GenericAzureResource,
                    "dataSourceId": PreDefinedDataSourceIds.ACR
                },
                {
                    "name": "containerPort",
                    "displayName": null,
                    "type": TemplateParameterType.String,
                    "dataSourceId": PreDefinedDataSourceIds.RepoAnalysis,
                    "defaultValue": "80"
                },
                {
                    "name": "namespace",
                    "displayName": null,
                    "type": TemplateParameterType.String,
                    "dataSourceId": "",
                    "defaultValue": "{{#toLower}}{{#sanitizeString}}{{{inputs.aksCluster.name}}}{{/sanitizeString}}{{/toLower}}{{#tinyguid}}{{/tinyguid}}"
                }
            ],
            assets: [
                {
                    "id": "kubeConfig",
                    "type": TemplateAssetType.GitHubAKSKubeConfig
                },
                {
                    "id": "containerRegistryUsername",
                    "type": TemplateAssetType.GitHubRegistryUsername
                },
                {
                    "id": "containerRegistryPassword",
                    "type": TemplateAssetType.GitHubRegistryPassword
                },
                {
                    "id": "deployment",
                    "type": TemplateAssetType.File
                },
                {
                    "id": "service",
                    "type": TemplateAssetType.File
                },
                {
                    "id": "ingress",
                    "type": TemplateAssetType.File
                },
                {
                    "id": "service-ingress",
                    "type": TemplateAssetType.File
                }
            ],
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        }
    ],
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
                    "type": TemplateAssetType.AzureARMPublishProfileServiceConnection
                }
            ],
            azureConnectionType: AzureConnectionType.AzureRMPublishProfile,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        },
    ],
    'dotnetcore': [],
    'dotnet': []
};

const azurePipelineTargetBasedTemplates: { [key in AzureTarget]: LocalPipelineTemplate[] } =
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        },
        {
            label: PipelineTemplateLabels.NodeJSFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxFunctionApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        },
        {
            label: PipelineTemplateLabels.DotNetCoreFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreLinuxFunctionApp.yml'),
            language: SupportedLanguage.DOTNETCORE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        },
        {
            label: PipelineTemplateLabels.PythonFunctionAppToLinuxAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxFunctionApp.yml'),
            language: SupportedLanguage.PYTHON,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        },
    ]
};

const githubWorkflowTargetBasedTemplates: { [key in AzureTarget]: LocalPipelineTemplate[] } =
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            //To-DO : weight is greater than the remote templates, to be changed later
            templateWeight: 999999,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        },
        {
            label: PipelineTemplateLabels.NodeJSFunctionAppToAzureFunction,
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsLinuxFunctionApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: TargetKind.FunctionAppLinuxContainer,
            enabled: true,
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
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
            azureConnectionType: AzureConnectionType.AzureRMServicePrincipal,
            templateWeight: 100,
            templateType: TemplateType.LOCAL
        }
    ]
};
