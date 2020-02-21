export const AzureDevOpsBaseUrl: string = "https://dev.azure.com";
export const HostedVS2017QueueName: string = "Hosted VS2017";
export const ReservedHostNames: string[] = [
    // Reserved names from https://dev.azure.com/mseng/AzureDevOps/_git/AzureDevOps?path=%2FMps%2FService%2FNameResolution%2FServicing%2FHost%2FDeployment%2FGroups%2FInstall%2FInstallNameResolutionService.xml&version=GBmaster
    // Forbidden
    "aisvc",
    "cdn1",
    "cdn2",
    "cdn3",
    "developers",
    "elstest",
    "events",
    "hooks",
    "integrate",
    "launch",
    "myname",
    "servicefabric",
    "sps",
    "tfsodata",
    "vssh",
    "vsrm",
    "yourname",
    "app",
    "deployment",
    "services",
    "teamfoundation",
    "teamfoundationserver",
    "tfs",
    "ww",
    "www",
    "wwww",

    // MicrosoftReserved
    "alm",
    "almsearch",
    "api",
    "auditservice",
    "azchatops",
    "azdevchatops",
    "azminicom",
    "azboards",
    "careers",
    "cdn1",
    "cdn2",
    "code",
    "codesmarts",
    "dev",
    "dl",
    "docs",
    "download",
    "e",
    "elstest",
    "events",
    "exchange",
    "explore",
    "feeds",
    "forums",
    "githubapp",
    "githubapps",
    "gdprdel",
    "hooks",
    "i2",
    "i3",
    "insightsportal",
    "intellitrace",
    "internetexplorer",
    "jscript",
    "launch",
    "liveshare",
    "lync",
    "media",
    "my",
    "offer",
    "orgsearch",
    "pipelines",
    "pipelinesapp",
    "portal",
    "premium",
    "professional",
    "project-cascade",
    "promo",
    "reg",
    "skydrive",
    "scaleunits",
    "secretscan",
    "servicedeployments",
    "servicehosts",
    "sps",
    "sqlazure",
    "ssh", ,
    "start",
    "status", ,
    "statusalt1",
    "status-alt1",
    "support",
    "taco",
    "tfs",
    "tfsapp",
    "tfsodata",
    "tutorials",
    "ultimate",
    "userext",
    "video",
    "vscatalog",
    "vsdevprofile",
    "vsdscops",
    "vsengsaas",
    "vsevidence",
    "vskeros",
    "vslicense",
    "vsnotify",
    "vsmps",
    "vsrtc",
    "vssh",
    "vsodata",
    "vspolicy",
    "vssps",
    "vsstage",
    "vstmr",
    "vstsusers",
    "vsworking",
    "web",
    "webmatrix",
    "webtooling",
    "www",
    "x-boards",
    "x-pipes",
    "x-ibizacd",

    // Based on past failures
    "teamservices",
    "java",
    "beta"
];

export const PipelineTemplateLabels = {
    SimpleApplicationToAppService: 'Simple application to App Service',
    NodeJSWithNpmToAppService: 'Node.js with npm to App Service',
    NodeJSWithGulpToAppService: 'Node.js with Gulp to App Service',
    NodeJSWithGruntToAppService: 'Node.js with Grunt to App Service',
    NodeJSWithAngularToAppService: 'Node.js with Angular to App Service',
    NodeJSWithWebpackToAppService: 'Node.js with Webpack to App Service',
    DotNetCoreWebAppToAppService: '.NET Core Web App to App Service',
    NodeJSFunctionAppToAzureFunction: 'Node.js Function App to Azure Function',
    DotNetCoreFunctionAppToAzureFunction: '.NET Core Function App to Azure Function',
    PythonFunctionAppToLinuxAzureFunction: 'Python Function App to Linux Azure Function'
};

export const SelectFolderOrRepository = 'selectFolderOrRepository';
export const SelectOrganization = 'selectOrganization';
export const SelectProject = 'selectProject';
export const EnterOrganizationName = 'enterOrganizationName';
export const SelectPipelineTemplate = 'selectPipelineTemplate';
export const SelectSubscription = 'selectSubscription';
export const SelectWebApp = 'selectWebApp';
export const SelectFunctionApp = 'selectFunctionApp';
export const GitHubPat = 'gitHubPat';
export const SelectFromMultipleWorkSpace = 'selectFromMultipleWorkSpace';
export const SelectRemoteForRepo = 'selectRemoteForRepo';
export const VstsRmScmType = 'VSTSRM';
export const BrowseNotAvailableConfigurePipeline =  'BrowseNotAvailableConfigurePipeline';
export const DeploymentMessageType = 'CDDeploymentConfiguration';
export const SetupAlreadyExists =  'SetupAlreadyExists';
export const Browse = 'Browse';
export const TargetResource = 'targetResource';
export const ResourceDynamicValidationFailure = 'ResourceDynamicValidationFailure';

//RepoAnalysis constants expected in response of Repository Analysis Service
export const RepoAnalysisConstants = {
    //Common
    Master: 'master',

    //Node
    Gulp: 'gulp',
    Grunt: 'grunt',
    GulpFilePath: 'gulpFilePath',
    GruntFilePath: 'gruntFilePath',
    PackageFilePath: 'packageFilePath',

    //Python
    Django: 'django',
    RequirementsFilePath: 'requirementsFilePath',

    //Functions
    AzureFunctions: 'azure:functions',
    HostFilePath: 'hostFilePath'
};

export const deploymentManifest:string = "deployment";
export const serviceManifest:string = "service";
export const serviceIngressManifest:string = "service-ingress";
export const ingressManifest:string = "ingress";