import { TemplateParameterHelper } from "../helper/templateParameterHelper";
import { ITemplateSelector } from "./ITemplateSelector";

export class AksTemplateSelector implements ITemplateSelector {
    async getTemplate(inputs: any): Promise<void> {
        let templateParameterHelper = new TemplateParameterHelper();
        await templateParameterHelper.setParameters(inputs.pipelineConfiguration.template.parameters, inputs);
        return null;
    }
    
          
}