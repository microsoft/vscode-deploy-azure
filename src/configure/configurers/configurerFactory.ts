import { LocalGitRepoHelper } from '../helper/LocalGitRepoHelper';
import { AzureSession, extensionVariables, GitRepositoryParameters, RepositoryProvider } from '../model/models';
import { TemplateType } from '../model/templateModels';
import { Messages } from '../resources/messages';
import { AzurePipelineConfigurer } from './azurePipelineConfigurer';
import { Configurer } from './configurerBase';
import { LocalGitHubWorkflowConfigurer } from './localGithubWorkflowConfigurer';
import { RemoteGitHubWorkflowConfigurer } from './remoteGitHubWorkflowConfigurer';

export class ConfigurerFactory {
    public static GetConfigurer(sourceRepositoryDetails: GitRepositoryParameters, azureSession: AzureSession, templateType: TemplateType, localGitRepoHelper: LocalGitRepoHelper): Configurer {
        switch (sourceRepositoryDetails.repositoryProvider) {
            case RepositoryProvider.Github:
                if (extensionVariables.enableGitHubWorkflow) {
                    return templateType === TemplateType.LOCAL ? new LocalGitHubWorkflowConfigurer(localGitRepoHelper) : new RemoteGitHubWorkflowConfigurer(azureSession, localGitRepoHelper);
                }
                return new AzurePipelineConfigurer(azureSession);
            case RepositoryProvider.AzureRepos:
                return new AzurePipelineConfigurer(azureSession);
            default:
                throw new Error(Messages.cannotIdentifyRespositoryDetails);
        }
    }
}
