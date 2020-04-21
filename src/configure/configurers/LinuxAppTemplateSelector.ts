import { ITemplateSelector } from "./ITemplateSelector";

export class LinuxAppTemplateSelector implements ITemplateSelector {
    getTemplate(inputs: any): Promise<void> {
        let selectedPipelineTemplate = inputs.pipelineConfiguration.potentialTemplates.find((template) => template.targetKind === "app,linux");

        inputs.pipelineConfiguration.template = selectedPipelineTemplate;
        return null;
    }
    
          
}