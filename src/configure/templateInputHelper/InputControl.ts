import * as utils from 'util';
import * as vscode from 'vscode';
import { ControlProvider } from '../helper/controlProvider';
import { MustacheHelper } from '../helper/mustacheHelper';
import { telemetryHelper } from '../helper/telemetryHelper';
import { DataSource, ExtendedInputDescriptor, InputDataType, InputDynamicValidation, InputMode } from "../model/Contracts";
import { AzureSession, ControlType, QuickPickItemWithData, StringMap } from '../model/models';
import { Messages } from '../resources/messages';
import { TracePoints } from '../resources/tracePoints';
import { DataSourceExpression } from './utilities/DataSourceExpression';
import { DataSourceUtility } from './utilities/DataSourceUtility';
import { StaticValidator } from './utilities/validation/StaticValidator';

const Layer: string = 'InputControl';

export class InputControl {
    public dataSource: DataSourceExpression;
    public dataSourceInputControls: Array<InputControl>;
    public dataSourceInputs: Map<string, any>;
    public inputDescriptor: ExtendedInputDescriptor;
    private value: any;
    private controlType: ControlType;
    private visible: boolean;
    private validationDataSourceToInputsMap: Map<DataSource, InputControl[]>;
    private azureSession: AzureSession;
    private _valuePendingValuation: any;
    private controlProvider: ControlProvider;

    constructor(inputDescriptor: ExtendedInputDescriptor, value: any, controlType: ControlType, azureSession: AzureSession) {
        this.inputDescriptor = inputDescriptor;
        this.value = value;
        this.visible = true;
        this.controlType = controlType;
        this.azureSession = azureSession;
        this.dataSourceInputControls = [];
        this.dataSourceInputs = new Map<string, any>();
        this.controlProvider = new ControlProvider();
    }

    public getValue(): any {
        return this.value;
    }

    public setValue(defaultValue: string) {
        this.value = defaultValue;
    }

    public getInputDescriptor(): ExtendedInputDescriptor {
        return this.inputDescriptor;
    }

    public getInputControlId(): string {
        return this.inputDescriptor.id;
    }

    public getInputGroupId(): string {
        return this.inputDescriptor.groupId;
    }

    public getInputMode(): InputMode {
        return this.inputDescriptor.inputMode;
    }

    public getVisibleRule(): string {
        return this.inputDescriptor.visibleRule;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public setVisibility(value: boolean): void {
        this.visible = value;
    }

    public async setInputControlValue(): Promise<any> {
        if (!this.isVisible()) {
            return;
        }
        if (!!this.dataSource) {
            var dependentInputs = this._getDataSourceInputs();
            if (this.controlType === ControlType.None || this.controlType === ControlType.InputBox) {
                this.value = await this.dataSource.evaluateDataSources(dependentInputs, this.azureSession);
                let errorMessage = await this.triggerControlValueValidations(this.value);
                if(!errorMessage){
                    vscode.window.showErrorMessage(errorMessage);
                    this.value = this.controlProvider.showInputBox(this.getInputControlId(), {
                        value: this.value,
                        placeHolder: this.inputDescriptor.name,
                        validateInput: (value) => this.triggerControlValueValidations(value)
                    });
                }
            }
            else if (this.controlType === ControlType.QuickPick) {
                let listItems: Array<QuickPickItemWithData> = await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: utils.format(Messages.fetchingInputMessage, this.inputDescriptor.name) },
                    () => this.dataSource.evaluateDataSources(dependentInputs, this.azureSession));
                let selectedItem: QuickPickItemWithData;
                while (1) {
                    selectedItem = await this.controlProvider.showQuickPick(this.getInputControlId(), listItems, {
                        placeHolder: this.inputDescriptor.name
                    });
                    let errorMessage = await this.triggerControlValueValidations(selectedItem.data);
                    if (!errorMessage) {
                        break;
                    }
                    vscode.window.showErrorMessage(errorMessage);
                }
                this.value = selectedItem.data;
            }
        }
        else {
            if (this.controlType === ControlType.QuickPick) {
                var listItems: Array<{ label: string, data: any }> = [];
                if (!!this.inputDescriptor.possibleValues && this.inputDescriptor.possibleValues.length > 0) {
                    this.inputDescriptor.possibleValues.forEach((item) => {
                        listItems.push({ label: item.displayValue, data: item.value });
                    });
                }
                else if (this.inputDescriptor.inputMode === InputMode.RadioButtons) {
                    listItems.push({ label: "Yes", data: "true" });
                    listItems.push({ label: "No", data: "false" });
                }
                this.value = (await this.controlProvider.showQuickPick(this.getInputControlId(), listItems, { placeHolder: this.inputDescriptor.name })).data;
            }
            else if (this.controlType === ControlType.InputBox) {
                this.value = await this.controlProvider.showInputBox(this.getInputControlId(), {
                    value: this.value,
                    placeHolder: this.inputDescriptor.name,
                    validateInput: (value) => this.triggerControlValueValidations(value)
                });
            }
        }
    }

    public getPropertyValue(propertyName: string, inputs?: StringMap<any>): string {
        var properties = this.inputDescriptor.properties;
        var value: string;

        if (!!properties) {
            value = properties[propertyName];
            if (!!value && !!inputs) { return MustacheHelper.render(value, { inputs: inputs }); }
        }
        return value;
    }

    public setValidationDataSources(dataSourceToInputsMap: Map<DataSource, InputControl[]>) {
        this.validationDataSourceToInputsMap = dataSourceToInputsMap;
    }

    public async triggerControlValueValidations(value: string): Promise<string> {
        this._valuePendingValuation = value;
        let errorMessage = this.getStaticValidationsResult(value);
        if (errorMessage) {
            return Promise.resolve(errorMessage);
        }

        let validationPromises: Promise<string>[] = [];
        this.inputDescriptor.dynamicValidations.forEach((validation: InputDynamicValidation) => {
            validationPromises.push(this.evaluateDynamicValidation(validation, value));
        });

        return await Promise.all(validationPromises)
            .then((results: string[]) => {
                results.forEach((result) => {
                    if (result) {
                        errorMessage = errorMessage.concat(result);
                    }
                });
                return errorMessage;
            })
            .catch((error) => {
                return "";
            });
    }

    private _getDataSourceInputs(): { [key: string]: any } {
        var inputs: { [key: string]: any } = {};
        for (var dataSourceInput of this.dataSourceInputControls) {
            inputs[dataSourceInput.getInputControlId()] = dataSourceInput.getValue();
        }
        return inputs;
    }

    private getStaticValidationsResult(value: string): string {
        let validationResult = "";
        if (this.inputDescriptor.isRequired) {
            let result = StaticValidator.validateRequired(value);
            if (result) {
                validationResult = validationResult.concat(result);
            }
        }
        if (this.inputDescriptor.staticValidation) {
            if (!!this.inputDescriptor.staticValidation.minLength || !!this.inputDescriptor.staticValidation.maxLength) {
                let result = StaticValidator.validateLength(value, this.inputDescriptor.staticValidation.minLength, this.inputDescriptor.staticValidation.maxLength);
                if (result) {
                    validationResult = validationResult.concat(result);
                }
            }
            if (!!this.inputDescriptor.staticValidation.pattern) {
                var regexPattern = this.inputDescriptor.staticValidation.pattern;

                let result = StaticValidator.validateRegex(value, regexPattern, this.inputDescriptor.staticValidation.regexFlags || "");
                if (result) {
                    validationResult = this.inputDescriptor.staticValidation.errorMessage ? validationResult : validationResult.concat(result);
                }
            }
            if (this.inputDescriptor.type === InputDataType.Int && (!!this.inputDescriptor.staticValidation.minValue || !!this.inputDescriptor.staticValidation.maxValue)) {
                let result = StaticValidator.validateNumberValue(value, this.inputDescriptor.staticValidation.minValue, this.inputDescriptor.staticValidation.maxValue);
                if (result) {
                    validationResult = validationResult.concat(result);
                }
            }
        }
        return validationResult;
    }

    private async evaluateDynamicValidation(validation: InputDynamicValidation, value: string): Promise<string> {
        var requiredDataSource: DataSource = null;
        this.validationDataSourceToInputsMap.forEach((inputControlArray: InputControl[], dataSource: DataSource) =>{
             if (dataSource.id === validation.dataSourceId) {
                  requiredDataSource = dataSource; 
                }
             });

        var requiredInputsValueMap: StringMap<any> = {};
        var allRequiredInputValuesAvailable: boolean = true;
        this.validationDataSourceToInputsMap.get(requiredDataSource).forEach((descriptor) => {
            if (!descriptor.getValue()) {
                allRequiredInputValuesAvailable = false;
                return;
            }

            requiredInputsValueMap[descriptor.getInputControlId()] = descriptor.getValue();
        });
        // setting the value for the current input with the current value passed as the value might have changed since this validation call was invoked,
        requiredInputsValueMap[this.inputDescriptor.id] = value;

        if (allRequiredInputValuesAvailable) {
            return DataSourceUtility.evaluateDataSource(requiredDataSource, requiredInputsValueMap, this.azureSession)
                .then((result) => {
                    if (value === this._valuePendingValuation) {
                        if (!result) {
                            return validation.errorMessage;
                        }

                        var resultObject = JSON.parse(result);

                        if (resultObject && resultObject.value === "true") {
                            return null;
                        }
                        else {
                            return result && resultObject.message || validation.errorMessage;
                        }
                    }
                    else {
                        // The value of control has been changed, therefore resolve it as the validation of current value will override
                        return null;
                    }
                })
                .catch((error) => {
                    if (!(requiredDataSource.resultTemplate && requiredDataSource.resultTemplate.toLowerCase() === "false")) {
                        telemetryHelper.logError(Layer, TracePoints.EvaluateDynamicValidation, error);
                    }
                    return null;
                });
        }
        else {
            // Resolve as valid here as other validation for required input will be shown
            return null;
        }
    }
}