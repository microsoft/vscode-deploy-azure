import { Configurer } from './configurerBase';
import { GitHubWorkflowConfigurer } from '../configurers/githubWorkflowConfigurer';
import { AzurePipelineConfigurer } from './azurePipelineConfigurer';
import { GitRepositoryParameters, RepositoryProvider, AzureSession, extensionVariables } from '../model/models';
import { Messages } from '../resources/messages';

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
