import { DataSource } from "./DataSource";
import { InputDescriptor } from "./InputDescriptor";
import { InputGroup } from "./InputGroup";

export class PipelineTemplateNew {

    groups: InputGroup[];
    dataSources: DataSource[];
    inputs: InputDescriptor[];
    attributes: { key: string, value: any }[];
}