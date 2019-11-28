import { PipelineTemplate, WizardInputs, RepositoryProvider, TargetResourceType, WebAppKind, extensionVariables, ParameterType } from '../model/models';
import * as fs from 'fs';
import * as Mustache from 'mustache';
import * as path from 'path';
import * as Q from 'q';
import { Messages } from '../resources/messages';
import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { UniqueResourceNameSuffix } from '../configure';

export async function analyzeRepoAndListAppropriatePipeline(repoPath: string, repositoryProvider: RepositoryProvider, targetResource?: GenericResource): Promise<PipelineTemplate[]> {
    let analysisResult = await analyzeRepo(repoPath);

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
                templateResult = templateResult.concat(azurePipelineTargetBasedTemplates['Microsoft.Web/sites-functionapp']);
                break;
            case RepositoryProvider.Github:
                templateResult = extensionVariables.enableGitHubWorkflow ? templateResult.concat(azurePipelineTargetBasedTemplates['Microsoft.Web/sites-functionapp']) : templateResult.concat(githubWorkflowTargetBasedTemplates['Microsoft.Web/sites-functionapp']);
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

export class AnalysisResult {
    public languages: SupportedLanguage[];
    public isFunctionApp: boolean;
    // public isContainerized: boolean;
}

export enum SupportedLanguage {
    NONE = 'none',
    NODE = 'node',
    PYTHON = 'python',
    DOTNETCORE = 'dotnetcore',
    DOCKER = 'docker'
}

let azurePipelineTemplates: { [key in SupportedLanguage]: PipelineTemplate[] } =
{
    'none': [
        {
            label: 'Simple application to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/simpleWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Simple application to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/simpleLinuxWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        }
    ],
    'node': [
        {
            label: 'Node.js with npm to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejs.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with Gulp to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGulp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with Grunt to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGrunt.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with Angular to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithAngular.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with Webpack to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithWebpack.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with npm to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Gulp to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGulpLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Grunt to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGruntLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Angular to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithAngularLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Webpack to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithWebpackLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        }
    ],
    'python': [
        {
            label: 'Python to Linux Web App on Azure',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxWebApp.yml'),
            language: 'python',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Build and Test Python Django App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonDjango.yml'),
            language: 'python',
            targetType: TargetResourceType.None,
            targetKind: null,
            enabled: true
        }
    ],
    'dotnetcore': [
        {
            label: '.NET Core Web App to Windows on Azure',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreWindowsWebApp.yml'),
            language: 'dotnetcore',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: '.NET Core Web App to Linux on Azure',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreLinuxWebApp.yml'),
            language: 'dotnetcore',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        }
    ],
    'docker': [
        {
            label: 'Containerized application to AKS',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/AksWithReuseACR.yml'),
            language: 'docker',
            targetType: TargetResourceType.AKS,
            targetKind: null,
            enabled: true,
            parameters: [
                {
                    "id": "acr",
                    "placeHolder": "Select Azure Container Registry to store docker image",
                    "type": ParameterType.Acr,
                    "defaultValue": "{{ targetResource.name }}" + UniqueResourceNameSuffix.toString()
                }
            ]
        }
    ]
};

let githubWorklowTemplates: { [key in SupportedLanguage]: PipelineTemplate[] } = {
    'node': [
        {
            label: 'Node.js with npm to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsOnWindows.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with npm to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsOnLinux.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Gulp to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGulpOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with Gulp to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGulpOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Grunt to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGruntOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with Grunt to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGruntOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Angular to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithAngularOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with Angular to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithAngularOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Webpack to Windows Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithWebpackOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: false
        },
        {
            label: 'Node.js with Webpack to Linux Web App',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithWebpackOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        }
    ],
    'none': [],
    'python': [
        {
            label: 'Python to Linux Web App on Azure',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/pythonLinuxWebApp.yml'),
            language: 'python',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
    ],
    'dotnetcore': [],
    'docker': []
};

const azurePipelineTargetBasedTemplates: { [key: string]: PipelineTemplate[] } =
{
    'Microsoft.Web/sites-functionapp': [
        {
            label: 'Node.js Function App to Windows Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWindowsFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionApp,
            enabled: false
        },
        {
            label: 'Node.js Function App to Linux Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        },
        {
            label: '.NET Core Function App to Windows Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreWindowsFunctionApp.yml'),
            language: 'dotnet',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionApp,
            enabled: false
        },
        {
            label: '.NET Core Function App to Linux Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreLinuxFunctionApp.yml'),
            language: 'dotnet',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        },
        {
            label: 'Python Function App to Linux Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxFunctionApp.yml'),
            language: 'python',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        },
    ]
}

const githubWorkflowTargetBasedTemplates: { [key: string]: PipelineTemplate[] } =
{
    'Microsoft.Web/sites-functionapp': [
        {
            label: 'Node.js Function App to Windows Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWindowsFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionApp,
            enabled: false
        },
        {
            label: 'Node.js Function App to Linux Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsLinuxFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        },
        {
            label: 'Python Function App to Linux Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/pythonLinuxFunctionApp.yml'),
            language: 'python',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        }
    ]
}
