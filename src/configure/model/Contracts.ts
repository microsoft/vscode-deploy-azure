export interface ExtendedInputDescriptor extends InputDescriptor {
    /**
     * Name of the data source which can be used to fetch possible values for this input
     */
    dataSourceId: string;
    /**
     * Default value of the input. If PossibleValues is specified, default value must of one of those
     */
    defaultValue: string;
    /**
     * List of dynamic remote url-based validations which can be performed on the input.
     */
    dynamicValidations: InputDynamicValidation[];
    /**
     * Name of the group to which this input belongs
     */
    groupId: string;
    /**
     * Mode in which the value of this input should be entered. Currently supported values - TextBox and Combo
     */
    inputMode: InputMode;
    /**
     * Specifies whether a value for this input must be provided
     */
    isRequired: boolean;
    /**
     * Localized name which can be shown as a label for the input
     */
    name: string;
    /**
     * Additional properties for the input group. This can contains UI hints for input placement, decoration, summary, etc
     */
    properties: { [key: string]: any; };
    /**
     * Static validation which can be performed on the input
     */
    staticValidation: InputStaticValidation;
    /**
     * Specifies the name which can be shown as sublabel for the input control
     */
    sublabel: string;
    /**
     * Defines the visibility rule of the input.
     */
    visibleRule: string;
}


/**
 * Extended version of pipeline template. It will additionally contains UX hints and other information which can be helpful to draw UX for this template
 */
export interface ExtendedPipelineTemplate {
    /**
    * Description of the CI/CD pipeline which is enabled by this template
    */
    description: string;
    /**
     * Unique id of the pipeline template
     */
    id: string;
    /**
     * List of the inputs required to create CI/CD pipeline
     */

    attributes?: { [key: string]: string; };

    parameters?: Parameters;

    configuration?: Configuration;
}

export interface Configuration {
    pipelineDefinition?: { [key: string]: string; };

    assets?: Asset[];

    variables?: Variable[];

    imports?: any;
}

export interface Parameters {

    /**
     * List of the inputs required to create CI/CD pipeline
     */
    inputs?: ExtendedInputDescriptor[];

    /**
     * List of data sources associated with this template
     */
    dataSources?: DataSource[];
    /**
     * List of input groups
     */
    groups?: InputGroup[];

}

export interface DataSource {
    /**
     * Stem of the remote URL to which request will be made. URL base is assumed to be Azure ARM URL base.
     */
    endpointUrlStem: string;
    /**
     * HTTP method for request
     */
    httpMethod?: string;
    id: string;
    /**
     * Serialized string for request body
     */
    requestBody?: string;
    /**
     * Jsonpath selector to get result from response
     */
    resultSelector?: string;
    /**
     * Result template which will be used to transform the data source result.
     */
    resultTemplate?: string;
}

export interface InputGroup {
    /**
     * Unique id for a group
     */
    id: string;
    /**
     * Localized name which can be shown as a label for the group
     */
    name: string;
    /**
     * Additional properties for the input group. This can contains UI hints for group placement etc.
     */
    properties: { [key: string]: string; };
}

/**
 * Mode in which an input must be entered in UI
 */
export enum InputMode {
    /**
     * This input should not be shown in the UI
     */
    None = 0,
    /**
     * An input text box should be shown
     */
    TextBox = 10,
    /**
     * An password input box should be shown
     */
    PasswordBox = 20,
    /**
     * A select/combo control should be shown
     */
    Combo = 30,
    /**
     * Checkbox should be shown(for true/false values)
     */
    CheckBox = 40,
    /**
     * A control for choosing azure subscription should be shown
     */
    AzureSubscription = 50,
    /**
     * A control for choosing AAD tenant
     */
    TenantId = 60,
    /**
     * A control to acquire AAD access token. Can be hidden if acquiring access token is non-interactive
     */
    AadAccessToken = 70,
    /**
     * A control for choosing one of the options from radio buttons shown
     */
    RadioButtons = 80,
    /**
     * A control for choosing virtual machine size
     */
    VirtualMachineSizeControl = 90
}

export enum InputDataType {
    String = 0,
    SecureString = 1,
    Int = 2,
    Bool = 3,
    Authorization = 4
}

export interface InputDescriptor {
    /**
     * Description of what this input is used for
     */
    description: string;
    /**
     * Identifier for the input
     */
    id: string;
    /**
     * Possible values that this input can take
     */
    possibleValues: InputValue[];
    /**
     * Data type of the input
     */
    // tslint:disable-next-line:no-reserved-keywords
    type: InputDataType;
}

/**
 * A dynamic validation for input value. Validation will done based on response from a data source
 */
export interface InputDynamicValidation {
    /**
     * Name of the data source to which a HTTP request will be made
     */
    dataSourceId: string;
    /**
     * Error message to show if this dynamic validation fails
     */
    errorMessage: string;
    /**
     * Result template which will transform data source response into success or failure
     */
    resultTemplate: string;
}

export interface InputStaticValidation {
    /**
     * Error message to show if static validation fails
     */
    errorMessage: string;
    /**
     * Maximum supported length of a string type input
     */
    maxLength: number;
    /**
     * Maximum supported value for a numeric type input
     */
    maxValue: number;
    /**
     * Minimum supported length of a string type input
     */
    minLength: number;
    /**
     * Minimum supported value for a numeric type input
     */
    minValue: number;
    /**
     * Regex pattern against which value will be matched
     */
    pattern: string;
    /**
     * Regex flags for pattern matching like 'i' for ignore case, etc
     */
    regexFlags: string;
}

/**
 * Information about a single value for an input
 */
export interface InputValue {
    /**
     * The text to show for the display of this value
     */
    displayValue: string;
    /**
     * The value to store for this input
     */
    value: string;
}

export interface Variable {
    id: string;
    value: string;
    logTelemetry?: boolean;
    hashTelemetryValue?: boolean;
}

export interface Asset {
    id: string;
    // tslint:disable-next-line: no-reserved-keywords
    type: string;
    stage: ConfigurationStage;
    inputs: { [key: string]: any };
}

export enum ConfigurationStage {
    Pre = "Pre",
    Post = "Post"
};
