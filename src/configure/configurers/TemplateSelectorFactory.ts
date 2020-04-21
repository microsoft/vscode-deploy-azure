import { GenericResource } from "azure-arm-resource/lib/resource/models";
import { AksTemplateSelector } from "./AksTemplateSelector";
import { ITemplateSelector } from "./ITemplateSelector";
import { LinuxAppTemplateSelector } from "./LinuxAppTemplateSelector";
import { WindowsAppTemplateSelector } from "./WindowsAppTemplateSelector";

export class TemplateSelectorFactory {

    public static getTemplateSelector(resource: GenericResource): ITemplateSelector {
        switch (resource.kind) {
            case null:
                return new AksTemplateSelector();
            case "app":
                return new WindowsAppTemplateSelector();
            case "app,linux":
                return new LinuxAppTemplateSelector();
            default:
                return null;
        }
    }
}