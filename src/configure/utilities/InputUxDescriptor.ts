import { InputBoxOptions, QuickPickItem } from 'vscode';
import { IAzureQuickPickOptions } from 'vscode-azureextensionui';
import { MustacheHelper } from '../helper/mustacheHelper';
import { DataSource, ExtendedInputDescriptor, InputDynamicValidation, InputMode, InputDataType } from "../model/Contracts";
import { AzureSession, ControlType, extensionVariables, StringMap } from '../model/models';
import { DataSourceExpression } from './DataSourceExpression';
import { DataSourceUtility } from "./DataSourceUtility";
import { StaticValidator } from "./validator/StaticValidator";


export class InputUxDescriptor {
   
    
    private _input: ExtendedInputDescriptor;
    private _value: any;
    private _controlType: ControlType;
    private _isVisible: boolean;
    public dataSource: DataSourceExpression;
    public dataSourceUxInputs: Array<InputUxDescriptor>;
    public dataSourceInputs: Map<string, any>;
    private _staticValidationDependentInputs: InputUxDescriptor[];
    private _visibilityDependentOnOption: boolean;

    constructor(input: ExtendedInputDescriptor, value: any, controlType: ControlType){
        this._input = input;
        this._value = value;
        this._isVisible = true;
        this._controlType = controlType;
        this.dataSourceUxInputs = [];
        this.dataSourceInputs = new Map<string, any>();
    }

    public async setInputUxDescriptorValue(azureSession: AzureSession): Promise<any> {
        if(!!this.dataSource && !this._visibilityDependentOnOption){
            var inputs = this._getDataSourceInputs();
            if(this._controlType === ControlType.InputBox) {
                this._value = await this.dataSource.evaluateDataSources(inputs, azureSession)
                .then((value) => {
                    if(this.IsVisible()){
                        return this.showInputBox(this._input.description, {placeHolder: this._input.description});
                    }
                    return value;
                });
            } else {
                let selectedValue = await this.dataSource.evaluateDataSources(inputs, azureSession)
                .then((listItems: Array<{label: string,data: any, group?: string}>) => {
                    if(this.IsVisible()){
                        return this.showQuickPick(this._input.description, listItems, {placeHolder: this._input.description});
                    }
                    return listItems[0];
                });
                this._value = selectedValue.data;
            }
        } else {
            if(this.IsVisible()){
                if (!!this._input.possibleValues && this._input.possibleValues.length > 0) {
                    var listItems: Array<{label: string,data: any}> = [];
                    this._input.possibleValues.forEach((item, index) => {
                        listItems.push({ label: item.displayValue, data: item.value });
                    });
                    let selectedValue = await this.showQuickPick(this._input.description, listItems, {placeHolder: this._input.description});
                    this._value = selectedValue.data;
                }
            }            
        }
    }


    private _getDataSourceInputs(): {[key: string] :any}{
        var inputs: {[key: string] :any} = {};
        for (var dataSourceInput of this.dataSourceUxInputs) {
            inputs[dataSourceInput.getInputUxDescriptorId()] = dataSourceInput.getParameterValue();
        }
        this.dataSourceInputs.forEach((value,key) =>{
            inputs[key] = value;
        });
        return inputs;
    }

    public setVisibilityDependentOnOption(value: boolean) {
        this._visibilityDependentOnOption = value;
    }

    public getValue(): any {
        return this._value;
    }

    public updateValue(defaultValue: string) {
        this._value = defaultValue;
    }
    
    public getInputUxDescriptorId(): string {
        return this._input.id;
    }

    public getInputGroupId(): string {
        return this._input.groupId;
    }

    public getInputMode(): InputMode {
        return this._input.inputMode;
    }

    public getParameterValue(): any {
        return this._value;
    }

    public getVisibleRule(): string{
        return this._input.visibleRule;
    }

    public IsVisible(): boolean {
        return this._isVisible;
    }

    public setInputVisibility(value: boolean): void {
        this._isVisible = value;
    }

    public getPropertyValue(propertyName: string, inputs?: StringMap<any>): string {
        return InputUxDescriptor.getUxDescriptorProperty(this._input, propertyName, inputs);
    }

    public setStaticValidationDependentInputs(inputUxdescriptorArray: InputUxDescriptor[]) {
        this._staticValidationDependentInputs = inputUxdescriptorArray;
    }

    public static getUxDescriptorProperty(inputDescriptor: ExtendedInputDescriptor, property: string, inputs?: StringMap<any>): any {
        var properties = inputDescriptor.properties;
        var value: Object;

        if (!!properties) {
            value = properties[property];
            if (!!value && !!inputs && typeof value === "string") {
                return MustacheHelper.render(value, { inputs: inputs })
            } else if (!!value && !!inputs) {
                return MustacheHelper.renderObject(value, { inputs: inputs });
            }
        }
        return value;
    }

    private async showQuickPick<T extends QuickPickItem>(listName: string, listItems: T[] | Thenable<T[]>, options: IAzureQuickPickOptions, itemCountTelemetryKey?: string): Promise<T> {
        try {
            //telemetryHelper.setTelemetry(TelemetryKeys.CurrentUserInput, listName);
            return await extensionVariables.ui.showQuickPick(listItems, options);
        }
        finally {
            if (itemCountTelemetryKey) {
                //telemetryHelper.setTelemetry(itemCountTelemetryKey, (await listItems).length.toString());
            }
        }
    }

    private async showInputBox(inputName: string, options: InputBoxOptions): Promise<string> {
        //telemetryHelper.setTelemetry(TelemetryKeys.CurrentUserInput, inputName);
        return await extensionVariables.ui.showInputBox(options);
    }

    public getStaticValidationsResult(currentValue?: string) {
        if (!currentValue) {
            currentValue = this.getParameterValue();
        }

        var validationResult = { valid: true, message: "" };

        if (this._input.isRequired) {
            let result = StaticValidator.validateRequired(currentValue);
            if (!result.valid) {
                validationResult.valid = false;
                validationResult.message = validationResult.message.concat(result.message);
            }
        }

        if (this._input.staticValidation) {
            if (!!this._input.staticValidation.minLength || !!this._input.staticValidation.maxLength) {
                let result = StaticValidator.validateLength(currentValue, this._input.staticValidation.minLength, this._input.staticValidation.maxLength);
                if (!result.valid) {
                    validationResult.valid = false;
                    validationResult.message = validationResult.message.concat(result.message);
                }
            }
            if (!!this._input.staticValidation.pattern) {
                var regexPattern = this._input.staticValidation.pattern;
                if (this._staticValidationDependentInputs.length > 0) {
                    var inputMap: StringMap<any> = {};
                    var allRequiredInputValuesAvailable: boolean = true;
                    this._staticValidationDependentInputs.forEach((descriptor) => {
                        if (!descriptor.getParameterValue()) {
                            allRequiredInputValuesAvailable = false;
                            return;
                        }
                        inputMap[descriptor.getInputUxDescriptorId()] = InputUxDescriptor.EscapeRegExp(descriptor.getParameterValue());
                    });

                    if (allRequiredInputValuesAvailable) {
                        regexPattern = MustacheHelper.render(this._input.staticValidation.pattern, { inputs: inputMap });
                    } else {
                        return { valid: false, message: "" };
                    }
                }
                let result = StaticValidator.validateRegex(currentValue, regexPattern, this._input.staticValidation.regexFlags || "" );
                if (!result.valid) {
                    validationResult.valid = false;
                    validationResult.message = this._input.staticValidation.errorMessage ? validationResult.message : validationResult.message.concat(result.message);
                }
            }
            if (this._input.type === InputDataType.Int && (!!this._input.staticValidation.minValue || !!this._input.staticValidation.maxValue)) {
                let result = StaticValidator.validateNumberValue(currentValue, this._input.staticValidation.minValue, this._input.staticValidation.maxValue);
                if (!result.valid) {
                    validationResult.valid = false;
                    validationResult.message = validationResult.message.concat(result.message);
                }
            }
        }

        if (!validationResult.valid && this._input.staticValidation && this._input.staticValidation.errorMessage) {
            validationResult.message = validationResult.message.concat(this._input.staticValidation.errorMessage);
        }

        return validationResult;
    }

    public evaluateDynamicValidation(validation: InputDynamicValidation, valueObject: any, azureSession: AzureSession): Q.Promise<any> {
        var deferred : Q.Promise<any>;

        var value: string = <string>valueObject;
        
        var requiredDataSource: DataSource = null;
        //this._validationDataSourceToInputsMap.forEach((descriptorsArray, dataSource) => { if (dataSource.id === validation.dataSourceId) { requiredDataSource = dataSource; } });

        var currentValueOfRequiredInputs: Map<string,any> = new Map<string,any>();
        var allRequiredInputValuesAvailable: boolean = true;
        // this._validationDataSourceToInputsMap.get(requiredDataSource).forEach((descriptor) => {
        //     if (!descriptor.getParameterValue()) {
        //         allRequiredInputValuesAvailable = false;
        //         return;
        //     }

        //     currentValueOfRequiredInputs[descriptor.getInputUxDescriptorId()] = descriptor.getParameterValue();
        // });
        // setting the value for the current input with the current value passed as the value might have changed since this validation call was invoked,
        currentValueOfRequiredInputs[this._input.id] = value;

        if (allRequiredInputValuesAvailable) {
            DataSourceUtility.evaluateDataSource(requiredDataSource, currentValueOfRequiredInputs, azureSession)
                .then((result) => {
                    if (value === this.getParameterValue()) {
                        if (!result) {
                            //deferred.resolve(MsPortalFx.ViewModels.getValidationResult(validation.errorMessage);
                        }

                        var resultObject = JSON.parse(result);

                        if (resultObject && resultObject.value === "true") {
                            //deferred.resolve(MsPortalFx.ViewModels.getValidationResult(null));
                        }
                        else {
                            //deferred.resolve(MsPortalFx.ViewModels.getValidationResult(result && resultObject.message || validation.errorMessage));
                        }
                    }
                    else {
                        // The value of control has been changed, therefore resolve it as the validation of current value will override
                        //deferred.resolve(MsPortalFx.ViewModels.getValidationResult());
                    }
                })
                .catch((error) => {
                    // Log UX error only if data source call is NOT expected to fail
                    if (!(requiredDataSource.resultTemplate && requiredDataSource.resultTemplate.toLowerCase() === "false")) {
                        //var message = "Error in validating input: {0}, of pipeline template with Id: {1}".format(this._input.id, this._pipelineTemplateId);
                        
                    }
                    //deferred.resolve(MsPortalFx.ViewModels.getValidationResult(null));
                });
        }
        else {
            // Resolve as valid here as other validation for required input will be shown
            //deferred.resolve(MsPortalFx.ViewModels.getValidationResult());
        }

        return deferred;
    }
}