import { PipelineTemplate, WizardInputs, RepositoryProvider, TargetResourceType, WebAppKind, extensionVariables } from '../model/models';
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
            templateList = extensionVariables.enableGitHubWorkflow ? githubWorklowTemplates : azurePipelineTemplates;
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
                templateResult = azurePipelineTargetBasedTemplates['Microsoft.Web/sites-functionapp'].concat(templateResult);
                break;
            case RepositoryProvider.Github:
                templateResult = extensionVariables.enableGitHubWorkflow ? githubWorkflowTargetBasedTemplates['Microsoft.Web/sites-functionapp'].concat(templateResult) : azurePipelineTargetBasedTemplates['Microsoft.Web/sites-functionapp'].concat(templateResult);
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

export function getTemplate(repositoryProvider: RepositoryProvider, language: string, targetType: TargetResourceType, targetKind: WebAppKind): PipelineTemplate {
    let pipelineTemplates: PipelineTemplate[] = null;
    if (repositoryProvider === RepositoryProvider.AzureRepos || !extensionVariables.enableGitHubWorkflow) {
        pipelineTemplates = azurePipelineTemplates[language];
        if (targetType === TargetResourceType.WebApp && isFunctionAppType(targetKind)) {
            pipelineTemplates = pipelineTemplates.concat(azurePipelineTargetBasedTemplates[`${targetType}-${targetKind}`]);
        }
    }
    else {
        pipelineTemplates = githubWorklowTemplates[language];
        if (targetType === TargetResourceType.WebApp && isFunctionAppType(targetKind)) {
            pipelineTemplates = pipelineTemplates.concat(githubWorkflowTargetBasedTemplates[`${targetType}-${targetKind}`]);
        }
    }

    return pipelineTemplates.find((template) => {
        return template.language === language && template.targetType === targetType && template.targetKind === targetKind  && template.enabled === true;
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
        result.languages = isNodeRepo(files) ? result.languages.concat(SupportedLanguage.NODE) : result.languages;
        result.languages = isPythonRepo(files) ? result.languages.concat(SupportedLanguage.PYTHON) : result.languages;
        result.languages = isDotnetCoreRepo(files) ? result.languages.concat(SupportedLanguage.DOTNETCORE) : result.languages;
        result.languages = result.languages.concat(SupportedLanguage.NONE);

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

function isFunctionApp(files: string[]): boolean {
    return files.some((file) => {
        return file.toLowerCase().endsWith("host.json");
    });
}

function isFunctionAppType(targetKind: WebAppKind): boolean {
    return targetKind === WebAppKind.FunctionApp || targetKind === WebAppKind.FunctionAppLinux || targetKind === WebAppKind.FunctionAppLinuxContainer;
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
    public isFunctionApp: boolean;
    // public isContainerized: boolean;
}

export enum SupportedLanguage {
    NONE = 'none',
    NODE = 'node',
    PYTHON = 'python',
    DOTNETCORE = 'dotnetcore'
}

let azurePipelineTemplates: { [key in SupportedLanguage]: PipelineTemplate[] } =
{
    'none': [
        {
            label: 'Simple application to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/simpleWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Simple application to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/simpleLinuxWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        }
    ],
    'node': [
        {
            label: 'Node.js with npm to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejs.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with Gulp to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGulp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with Grunt to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGrunt.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with Angular to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithAngular.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with Webpack to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithWebpack.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with npm to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Gulp to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGulpLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Grunt to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithGruntLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Angular to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWithAngularLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Webpack to App Service',
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
            enabled: false
        }
    ],
    'dotnetcore': [
        {
            label: '.NET Core Web App to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreWindowsWebApp.yml'),
            language: 'dotnetcore',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: '.NET Core Web App to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreLinuxWebApp.yml'),
            language: 'dotnetcore',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        }
    ]
};

let githubWorklowTemplates: { [key in SupportedLanguage]: PipelineTemplate[] } = {
    'node': [
        {
            label: 'Node.js with npm to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsOnWindows.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with npm to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsOnLinux.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Gulp to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGulpOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with Gulp to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGulpOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Grunt to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGruntOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with Grunt to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithGruntOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Angular to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithAngularOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with Angular to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithAngularOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        },
        {
            label: 'Node.js with Webpack to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithWebpackOnWindowsWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Node.js with Webpack to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWithWebpackOnLinuxWebApp.yml'),
            language: SupportedLanguage.NODE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        }
    ],
    'none': [
        {
            label: 'Simple application to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/simpleWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.WindowsApp,
            enabled: true
        },
        {
            label: 'Simple application to App Service',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/simpleWebApp.yml'),
            language: SupportedLanguage.NONE,
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.LinuxApp,
            enabled: true
        }
    ],
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
    'dotnetcore': []
};

const azurePipelineTargetBasedTemplates: { [key: string]: PipelineTemplate[] } =
{
    'Microsoft.Web/sites-functionapp': [
        {
            label: 'Node.js Function App to Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsWindowsFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionApp,
            enabled: true
        },
        {
            label: 'Node.js Function App to Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/nodejsLinuxFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        },
        {
            label: '.NET Core Function App to Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreWindowsFunctionApp.yml'),
            language: 'dotnet',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionApp,
            enabled: true
        },
        {
            label: '.NET Core Function App to Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/dotnetcoreLinuxFunctionApp.yml'),
            language: 'dotnet',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        },
        {
            label: 'Python Function App to Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/azurePipelineTemplates/pythonLinuxFunctionApp.yml'),
            language: 'python',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        },
    ]
};

const githubWorkflowTargetBasedTemplates: { [key: string]: PipelineTemplate[] } =
{
    'Microsoft.Web/sites-functionapp': [
        {
            label: 'Node.js Function App to Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsWindowsFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionApp,
            enabled: true
        },
        {
            label: 'Node.js Function App to Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/nodejsLinuxFunctionApp.yml'),
            language: 'node',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        },
        {
            label: 'Python Function App to Azure Function',
            path: path.join(path.dirname(path.dirname(__dirname)), 'configure/templates/githubWorkflowTemplates/pythonLinuxFunctionApp.yml'),
            language: 'python',
            targetType: TargetResourceType.WebApp,
            targetKind: WebAppKind.FunctionAppLinux,
            enabled: true
        }
    ]
};
