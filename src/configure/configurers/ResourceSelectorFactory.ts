import { PipelineConfiguration } from "../model/models";
import { AksAzureResourceSelector } from "./AksAzureResourceSelector";
import { IAzureResourceSelector } from "./IAzureResourceSelector";
import { WebAppAzureResourceSelector } from "./WebAppAzureResourceSelector";

export class ResourceSelectorFactory{

    public static getAzureResourceSelector(pipelineConfiguration: PipelineConfiguration): IAzureResourceSelector
    {
        switch(pipelineConfiguration.template.label)
        {
            case "Containerized application to AKS":
                return new AksAzureResourceSelector();
            default:
                return new WebAppAzureResourceSelector();
        }
    }
}