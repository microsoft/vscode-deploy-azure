import { PipelineConfiguration, TargetResourceType } from "../model/models";
import { AksAzureResourceSelector } from "./AksAzureResourceSelector";
import { IAzureResourceSelector } from "./IAzureResourceSelector";
import { WebAppAzureResourceSelector } from "./WebAppAzureResourceSelector";

export class ResourceSelectorFactory {

    public static getAzureResourceSelector(pipelineConfiguration: PipelineConfiguration): IAzureResourceSelector {
        if (pipelineConfiguration.template.label === "Containerized application to AKS") {
            return new AksAzureResourceSelector();
        }

        switch (pipelineConfiguration.template.targetType) {
            case TargetResourceType.WebApp:
                return new WebAppAzureResourceSelector();
            default:
                throw new Error("Not supported");
        }
    }
}