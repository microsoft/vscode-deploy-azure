import { GenericResource } from "azure-arm-resource/lib/resource/models";

export interface IAzureResourceSelector {
     getAzureResource(inputs): Promise<GenericResource>;
}

