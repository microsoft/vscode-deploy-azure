import { GenericResource } from "azure-arm-resource/lib/resource/models";
import { AppServiceClient } from "../clients/azure/appServiceClient";
import { openBrowseExperience } from "../configure";
import { ControlProvider } from "../helper/controlProvider";
import * as templateHelper from '../helper/templateHelper';
import { QuickPickItemWithData, TargetResourceType } from "../model/models";
import { Messages } from "../resources/messages";
import { TelemetryKeys } from "../resources/telemetryKeys";
import { IAzureResourceSelector } from "./IAzureResourceSelector";

export class WebAppAzureResourceSelector implements IAzureResourceSelector {

     async getAzureResource(inputs): Promise<GenericResource> {
          switch (inputs.pipelineConfiguration.template.targetType) {
               case TargetResourceType.None:
                    return null;
               case TargetResourceType.WebApp:
               default:
                    let controlProvider = new ControlProvider();
                    let appServiceClient = new AppServiceClient(inputs.azureSession.credentials, inputs.azureSession.environment, inputs.azureSession.tenantId, inputs.subscriptionId);
                    let selectedPipelineTemplate = inputs.pipelineConfiguration.template;
                    let matchingPipelineTemplates = templateHelper.getPipelineTemplatesForAllWebAppKind(inputs.sourceRepository.repositoryProvider,
                         selectedPipelineTemplate.label, selectedPipelineTemplate.language, selectedPipelineTemplate.targetKind);

                    let webAppKinds = matchingPipelineTemplates.map((template) => template.targetKind);
                    let selectedResource: QuickPickItemWithData = await controlProvider.showQuickPick(
                         Messages.selectTargetResource,
                         appServiceClient.GetAppServices(webAppKinds)
                              .then((webApps) => webApps.map(x => { return { label: x.name, data: x }; })),
                         { placeHolder: Messages.selectTargetResource },
                         TelemetryKeys.AzureResourceListCount);
                         if (await appServiceClient.isScmTypeSet((<GenericResource>selectedResource.data).id)) {                              
                              await openBrowseExperience((<GenericResource>selectedResource.data).id);
                              throw new Error(Messages.setupAlreadyConfigured);
                          }
                    return <GenericResource>selectedResource.data;
          }

     }

}

