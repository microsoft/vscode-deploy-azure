import { PipelineTemplate, WizardInputs, RepositoryProvider, TargetResourceType, WebAppKind } from '../model/models';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import * as path from 'path';
import * as Q from 'q';
import { Messages } from '../resources/messages';
import { GenericResource } from 'azure-arm-resource/lib/resource/models';

export async function analyzeRepoAndListAppropriatePipeline(repoPath: string, repositoryProvider: RepositoryProvider, targetResource?: GenericResource): Promise<PipelineTemplate[]> {
    let analysisResult = await analyzeRepo(repoPath);

    let templateList: { [key: string]: PipelineTemplate[] } = {};
    switch (repositoryProvider) {
        case RepositoryProvider.AzureRepos:
            templateList = azurePipelineTemplates;
            break;
        case RepositoryProvider.Github:
            templateList = githubWorklowTemplates;
            break;
        default:
            throw new Error(Messages.cannotIdentifyRespositoryDetails);
    }

    let templateResult: PipelineTemplate[] = [];
    analysisResult.languages.forEach((language) => {
        switch (language) {
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
            case SupportedLanguage.NONE:
                    if (templateList[SupportedLanguage.NONE] && templateList[SupportedLanguage.NONE].length > 0) {
                        templateResult = templateResult.concat(templateList[SupportedLanguage.NONE]);
                    }
                    break;
            default:
                break;
        }
    })

    if (templateResult.length < 1 && templateList[SupportedLanguage.NONE] && templateList[SupportedLanguage.NONE].length > 0) {
        templateResult = templateList[SupportedLanguage.NONE];
    }

    if (analysisResult.isFunctionApp && azurePipelineTargetBasedTemplates[`${TargetResourceType.WebApp}-${WebAppKind.FunctionApp}`]) {
        templateResult = azurePipelineTargetBasedTemplates[`${TargetResourceType.WebApp}-${WebAppKind.FunctionApp}`].concat(templateResult);
    }

    templateResult = targetResource && !!targetResource.type ? templateResult.filter((template) => !template.targetType || template.targetType.toLowerCase() === targetResource.type.toLowerCase()) : templateResult;
    templateResult = targetResource && !!targetResource.kind ? templateResult.filter((template) => !template.targetKind || template.targetKind.toLowerCase() === targetResource.kind.toLowerCase()) : templateResult;
    return templateResult;
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
        result.languages = isNodeRepo(files) ? result.languages.concat(SupportedLanguage.NODE) : result.languages;
        result.languages = isPythonRepo(files) ? result.languages.concat(SupportedLanguage.PYTHON) : result.languages;
        result.languages = result.languages.concat(SupportedLanguage.NONE);

        result.isFunctionApp = err ? true : isFunctionApp(files),

            deferred.resolve(result);
    });

    return deferred.promise;
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
    })
}

function isFunctionApp(files: string[]): boolean {
    return files.some((file) => {
        return file.toLowerCase().endsWith("host.json");
    });
}

export class AnalysisResult {
    public languages: SupportedLanguage[];
    public isFunctionApp: boolean;
    // public isContainerized: boolean;
}

export enum SupportedLanguage {
    NODE = 'node',
    NONE = 'none',
    PYTHON = 'python'
}

let azurePipelineTemplates: { [key in SupportedLanguage]: PipelineTemplate[] } =
{
    'none': [
        {
            label: 'Simple application to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/simpleWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp
        }
    ],
    'node': [
        {
            label: 'Node.js with npm to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejs.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp
        },
        {
            label: 'Node.js with Gulp to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGulp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp
        },
        {
            label: 'Node.js with Grunt to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGrunt.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp
        },
        {
            label: 'Node.js with Angular to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithAngular.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp
        },
        {
            label: 'Node.js with Webpack to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithWebpack.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp
        }
    ],
    'python': [
        {
            label: 'Python to Linux Web App on Azure',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxWebApp.yml'),
            language: 'python',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp
        },
        {
            label: 'Build and Test Python Django App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonDjango.yml'),
            language: 'python',
            targetType: TargetResourceType.None,
            targetKind: null
        }
    ]
};

let githubWorklowTemplates: { [key in SupportedLanguage]: PipelineTemplate[] } = {
    'node': [
        {
            label: 'Node.js with npm to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsOnLinux.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp
        },
        {
            label: 'Node.js with npm to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsOnWindows.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp
        }
    ],
    'none': [],
    'python': []
};

const azurePipelineTargetBasedTemplates: { [key: string]: PipelineTemplate[] } =
{
    'Microsoft.Web/sites-functionapp': [
        {
            label: 'Python Function App to Linux Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxFunctionApp.yml'),
            language: 'python',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux
        },
        {
            label: 'Node.js Function App to Linux Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux
        },
        {
            label: '.NET Core Function App to Windows Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreWindowsFunctionApp.yml'),
            language: 'dotnet',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionApp
        },
    ]
}
