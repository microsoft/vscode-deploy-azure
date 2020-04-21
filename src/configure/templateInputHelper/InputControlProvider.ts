import { MustacheHelper } from "../helper/mustacheHelper";
import { ExtendedInputDescriptor, ExtendedPipelineTemplate, InputDataType, InputMode } from "../model/Contracts";
import { AzureSession, ControlType, IPredicate, StringMap } from '../model/models';
import { InputControl } from "./InputControl";
import { DataSourceExpression } from "./utilities/DataSourceExpression";
import { InputControlUtility } from "./utilities/InputControlUtility";
import { VisibilityHelper } from "./utilities/VisibilityHelper";

export class InputControlProvider {
    private _pipelineTemplate: ExtendedPipelineTemplate;
    private _inputControlsMap: Map<string, InputControl>;

    constructor(pipelineTemplate: ExtendedPipelineTemplate, context: { [key: string]: any }) {
        this._pipelineTemplate = pipelineTemplate;
        this._inputControlsMap = new Map<string, InputControl>();
        this._createControls(context);
    }

    public async getAllPipelineTemplateInputs(azureSession: AzureSession) {
        let parameters: { [key: string]: any } = {};
        for (let inputControl of this._inputControlsMap.values()) {
            this._setInputControlVisibility(inputControl);
            this._setupInputControlDefaultValue(inputControl);
            await inputControl.setInputControlValue(azureSession);
            parameters[inputControl.getInputControlId()] = inputControl.getValue();
        }
        return parameters;
    }

    private _createControls(context: { [key: string]: any }) {
        for (let input of this._pipelineTemplate.inputs) {
            var inputControl: InputControl = null;
            var inputControlValue = this._getInputControlValue(input, context);

            switch (input.inputMode) {
                case InputMode.None:
                case InputMode.AzureSubscription:
                    if (input.type !== InputDataType.Authorization) {
                        inputControl = new InputControl(input, inputControlValue, ControlType.None);
                    }
                    break;
                case InputMode.TextBox:
                case InputMode.PasswordBox:
                    inputControl = new InputControl(input, inputControlValue, ControlType.InputBox);
                    break;
                case InputMode.Combo:
                case InputMode.CheckBox:
                case InputMode.RadioButtons:
                    inputControl = new InputControl(input, inputControlValue, ControlType.QuickPick);
                    break;

            }
            if (inputControl) {
                this._inputControlsMap.set(input.id, inputControl);
            }
        }
        this._setInputControlDataSourceInputs();
    }

    private _setInputControlDataSourceInputs(): void {
        this._pipelineTemplate.inputs.forEach((inputDes) => {
            if (!!inputDes.dataSourceId) {
                var inputControl = this._inputControlsMap.get(inputDes.id);
                inputControl.dataSource = DataSourceExpression.parse(inputDes.dataSourceId, this._pipelineTemplate.dataSources);

                if (inputControl.dataSource) {
                    var dependentInputControlArray = this._getInputDependencyArray(inputControl, inputControl.dataSource.getInputDependencyArray());
                    if (dependentInputControlArray) {
                        inputControl.dataSourceInputControls.push(...dependentInputControlArray);
                    }
                } else {
                    throw new Error(`Data source {inputDes.dataSourceId} specified for input {inputDes.id} is not present in pipeline template {this._pipelineTemplate.id}`);
                }
            }
        });
    }

    private _setupInputControlDefaultValue(inputControl: InputControl): void {
        var inputDes = inputControl.getInputDescriptor();
        if (!inputDes.defaultValue || !InputControlUtility.doesExpressionContainsDependency(inputDes.defaultValue)) {
            return;
        }
        var dependentInputControlArray = this._getInputDependencyArray(inputControl, [inputDes.defaultValue], false);

        var defaultValue = this._computeMustacheValue(inputDes.defaultValue, dependentInputControlArray);
        if (defaultValue !== inputControl.getValue()) {
            inputControl.setValue(defaultValue);
        }
    }


    private _computeMustacheValue(mustacheExpression: string, dependentInputControlArray: InputControl[]): string {

        var dependentInputValues = this._getInputParameterValueIfAllSet(dependentInputControlArray);
        if (dependentInputControlArray && dependentInputControlArray.length > 0 && !dependentInputValues) {
            return "";
        } else {
            return MustacheHelper.render(mustacheExpression, { inputs: dependentInputValues });
        }
    }

    private _getInputControlValue(inputDes: ExtendedInputDescriptor, context: { [key: string]: any }) {
        if (!!context && !!context[inputDes.id]) {
            return context[inputDes.id];
        } else {
            return !inputDes.defaultValue
                || InputControlUtility.doesExpressionContainsDependency(inputDes.defaultValue)
                ? "" : inputDes.defaultValue;
        }
    }

    private _getInputDependencyArray(inputControl: InputControl, dependencyExpressionArray: string[], allowSelfDependency: boolean = true) {
        var dependentInputControlArray: InputControl[] = [];
        var dependentInputIds: string[] = [];
        for (var dependencyExpression of dependencyExpressionArray) {
            if (dependencyExpression) {
                dependentInputIds = dependentInputIds.concat(InputControlUtility.getDependentInputIdList(dependencyExpression));
            }
        }

        if (dependentInputIds.length === 0) {
            return null;
        }

        if (!allowSelfDependency && dependentInputIds.indexOf(inputControl.getInputControlId()) >= 0) {
            throw new Error(`Input '{inputControl.getInputControlId()}' has dependency on its own in pipeline template {this._pipelineTemplate.id}.`);
        }

        var uniqueDependentInputIds = dependentInputIds.filter(function (item, pos) {
            return dependentInputIds.indexOf(item) === pos;
        });

        for (var inputId of uniqueDependentInputIds) {
            var dependentInputControl = this._inputControlsMap.get(inputId);
            if (dependentInputControl) {
                dependentInputControlArray.push(dependentInputControl);
            } else {
                throw new Error(`Dependent input {inputId} specified for input {inputControl.getInputControlId()} is not present in pipeline template {this._pipelineTemplate.id}`);
            }
        }
        return dependentInputControlArray;
    }

    private _getInputParameterValueIfAllSet(dependentInputControlArray: InputControl[], useDisplayValue: boolean = false): StringMap<any> {
        var dependentInputValuesMap: StringMap<any> = {};
        if (!dependentInputControlArray) {
            return null;
        }

        for (var dependentInputControl of dependentInputControlArray) {
            if (!dependentInputControl.getValue()) {
                //Value of the parameter is not available, so rest of the input values will be useless.
                throw new Error("Unable to get the input value, inputs order may not be correct");
            }
            dependentInputValuesMap[dependentInputControl.getInputControlId()] = dependentInputControl.getValue();
        }
        return dependentInputValuesMap;
    }

    private _setInputControlVisibility(inputControl: InputControl): void {
        var visibilityRule = VisibilityHelper.parseVisibleRule(inputControl.getVisibleRule());
        if (visibilityRule !== null && visibilityRule.predicateRules !== null && visibilityRule.predicateRules.length >= 0) {
            var requiredInputControls: InputControl[] = [];

            visibilityRule.predicateRules.forEach((predicateRule: IPredicate) => {
                try {
                    requiredInputControls = requiredInputControls.concat([this._inputControlsMap.get(predicateRule.inputName)]);
                }
                catch (exception) {
                    throw new Error("Input defined in visiblity rule doesn't exist");
                }
            });
            inputControl.setVisibility(VisibilityHelper.evaluateVisibility(visibilityRule, requiredInputControls));
        }
    }
}