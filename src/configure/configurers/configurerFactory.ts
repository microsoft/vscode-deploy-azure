import { GitHubWorkflowConfigurer } from '../configurers/githubWorkflowConfigurer';
import { AzureSession, extensionVariables, GitRepositoryParameters, RepositoryProvider } from '../model/models';
import { Messages } from '../resources/messages';
import { AzurePipelineConfigurer } from './azurePipelineConfigurer';
import { Configurer } from './configurerBase';

export class ConfigurerFactory {
    public static GetConfigurer(sourceRepositoryDetails: GitRepositoryParameters, azureSession: AzureSession, subscriptionId: string): Configurer {
        switch(sourceRepositoryDetails.repositoryProvider) {
            case RepositoryProvider.Github:
                return extensionVariables.enableGitHubWorkflow ? new GitHubWorkflowConfigurer(azureSession, subscriptionId) : new AzurePipelineConfigurer(azureSession);
            case RepositoryProvider.AzureRepos:
                return new AzurePipelineConfigurer(azureSession);
            default:
                throw new Error(Messages.cannotIdentifyRespositoryDetails);
        }
    }
}
