export enum InputMode {

    None = 0,
    TextBox = 10,
    PasswordBox = 20,
    Combo = 30,
    CheckBox = 40,
    AzureSubscription = 50,
    TenantId = 60,
    AadAccessToken = 70,
    RadioButtons = 80,
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

    name: string;
    groupId: string;
    isRequired: boolean;
    sublabel: string;
    properties: { key: string, value: any }[];
    inputMode: InputMode;
    dataSourceId: string;
    defaultValue: string;
    staticValidation: { key: string, value: any }[];
    dynamicValidations: { key: string, value: any }[];
    visibleRule: string;
    id: string;
    description: string;
    type: InputDataType;
    possibleValues: { key: string, value: any }[];
    value: any;
}