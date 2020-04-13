export class TelemetryKeys {
    public static CurrentUserInput: string = 'currentUserInput';
    public static RepoProvider: string = 'repoProvider';
    public static AzureLoginRequired: string = 'azureLoginRequired';
    public static JourneyId: string = 'journeyId';
    public static SourceRepoLocation: string = 'sourceRepoLocation';
    public static NewOrganization: string = 'newOrganization';
    public static ChosenTemplate: string = 'chosenTemplate';
    public static PipelineDiscarded: string = 'pipelineDiscarded';
    public static BrowsePipelineClicked: string = 'browsePipelineClicked';
    public static MultipleWorkspaceFolders: string = 'multipleWorkspaceFolders';
    public static GitFolderExists: string = 'gitFolderExists';
    public static ScmType: string = 'scmType';
    public static BrowsedDeploymentCenter = 'browsedDeploymentCenter';
    public static BrowsedExistingPipeline = 'browsedExistingPipeline';
    public static ClickedConfigurePipeline = 'clickedConfigurePipeline';
    public static UpdatedWebAppMetadata = 'updatedWebAppMetadata';
    public static NewDevOpsRepository = 'newDevOpsRepository';
    public static AzureLoginOption = 'azureLoginOption';
    public static PipelineAlreadyConfigured = 'pipelineAlreadyConfigured';

    public static resourceType = 'resourceType';
    public static resourceKind = 'resourceKind';

    // Durations
    public static ExtensionActivationDuration = 'extensionActivationDuration';
    public static CommandExecutionDuration = 'commandExecutionDuration';
    public static GitHubPatDuration = 'gitHubPatDuration';

    // Count of drop down items
    public static OrganizationListCount = 'OrganizationListCount';
    public static ProjectListCount = 'ProjectListCount';
    public static AzureResourceListCount = 'AzureResourceListCount';
    public static WebAppListCount = 'WebAppListCount';
    public static PipelineTempateListCount = 'pipelineTempateListCount';
    public static SubscriptionListCount = 'SubscriptionListCount';
    public static WorkspaceListCount = 'WorkspaceListCount';
    public static pickListCount = 'pickList_%s_Count';
}
