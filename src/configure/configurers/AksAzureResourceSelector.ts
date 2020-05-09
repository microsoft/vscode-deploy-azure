import { GenericResource } from "azure-arm-resource/lib/resource/models";
import { TargetResourceType } from "../model/models";
import { IAzureResourceSelector } from "./IAzureResourceSelector";

export class AksAzureResourceSelector implements IAzureResourceSelector {
     async getAzureResource(inputs): Promise<GenericResource> {
          return { type: TargetResourceType.AKS };

     }

}

