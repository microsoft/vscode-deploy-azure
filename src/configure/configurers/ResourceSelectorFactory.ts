import { TargetResourceType } from "../model/models";
import { Messages } from "../resources/messages";
import { AksAzureResourceSelector } from "./AksAzureResourceSelector";
import { IAzureResourceSelector } from "./IAzureResourceSelector";
import { WebAppAzureResourceSelector } from "./WebAppAzureResourceSelector";

export class ResourceSelectorFactory {

    public static getAzureResourceSelector(targetType: TargetResourceType): IAzureResourceSelector {
        switch (targetType) {
            case TargetResourceType.WebApp:
                return new WebAppAzureResourceSelector();
            case TargetResourceType.AKS:
                return new AksAzureResourceSelector();
            default:
                throw new Error(Messages.ResourceNotSupported);
        }
    }
}