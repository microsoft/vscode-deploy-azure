import { ITemplateSelector } from "./ITemplateSelector";

export class WindowsAppTemplateSelector implements ITemplateSelector {
    getTemplate(inputs: any): Promise<void> {
        let selectedPipelineTemplate = inputs.pipelineConfiguration.potentialTemplates.find((template) => template.targetKind === "app");
        // let selectedPipelineTemplate = inputs.pipelineConfiguration.template;
        // let matchingPipelineTemplates = templateHelper.getPipelineTemplatesForAllWebAppKind(inputs.sourceRepository.repositoryProvider,
        //     selectedPipelineTemplate.label, selectedPipelineTemplate.language, selectedPipelineTemplate.targetKind);
        //let selectedTemplate = matchingPipelineTemplates.find((template) => template.targetKind === <TargetKind>inputs.targetResource.resource.kind);

        inputs.pipelineConfiguration.template = selectedPipelineTemplate;
        return null;
    }

          
}