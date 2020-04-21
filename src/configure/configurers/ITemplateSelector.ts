export interface ITemplateSelector {

    getTemplate(inputs) : Promise<void>;
}