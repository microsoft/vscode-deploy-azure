import { MustacheHelper } from "../helper/mustacheHelper";
import {ExtendedInputDescriptor, ExtendedPipelineTemplate, InputMode } from "../model/Contracts";
import { AzureSession, ControlType, IPredicate, StringMap } from '../model/models';
import { DataSourceExpression } from "./DataSourceExpression";
import { InputUxDescriptor } from "./InputUxDescriptor";
import { InputUxDescriptorUtility } from "./InputUxDescriptorUtility";
import { VisibilityHelper } from "./VisibilityHelper";

export class ControlProvider {
    private _pipelineTemplate: ExtendedPipelineTemplate;
    private _inputUxDescriptors: Map<string,InputUxDescriptor>;
    private _uxInputs: Map<string,ExtendedInputDescriptor>;

    constructor(pipelineTemplateParameters: ExtendedPipelineTemplate, inputs: { [key: string]: any}){
        this._pipelineTemplate = pipelineTemplateParameters;
        this._inputUxDescriptors = new Map<string, InputUxDescriptor>();
        this._uxInputs = new Map<string, ExtendedInputDescriptor>();
    }

    public async getAllInputUxDescriptors(inputValues: { [key: string]: any}, azureSession: AzureSession ) {
        this._createControls(inputValues);
        for(let inputUxDescriptor of this._inputUxDescriptors.values()){
            this._setInputUxVisibility(inputUxDescriptor);
            this._setupDefaultInputValue(inputUxDescriptor);
            await inputUxDescriptor.setInputUxDescriptorValue(azureSession);
        }
    }

    private _createControls(inputValues: { [key: string]: any}) {
        for( let input of this._pipelineTemplate.inputs){
            this._uxInputs.set(input.id, input);
            var inputUxDescriptor: InputUxDescriptor = null;
            var inputUxDescriptorValue = this._getInputUxDescriptorValue(input, inputValues);

            if(input.groupId === 'cdResource' && input.properties.cdResource){
                input.inputMode = InputMode.Combo;
            }
            switch(input.inputMode){
                case InputMode.TextBox:
                case InputMode.PasswordBox:
                    inputUxDescriptor = new InputUxDescriptor(input,inputUxDescriptorValue, ControlType.InputBox);
                    break;
                case InputMode.Combo:
                case InputMode.CheckBox:
                case InputMode.RadioButtons:
                case InputMode.AzureSubscription:
                    inputUxDescriptor = new InputUxDescriptor(input, inputUxDescriptorValue, ControlType.QucikPick);
                    break;

            }
            if(inputUxDescriptor){
                this._inputUxDescriptors.set(input.id, inputUxDescriptor);
            }
        }
        this._setUxDescriptorsDataSourceInputs();   
    }

    private _setUxDescriptorsDataSourceInputs(): void {
        this._uxInputs.forEach((inputDes) => {
            if ((inputDes.inputMode === InputMode.Combo || inputDes.inputMode === InputMode.TextBox) && !!inputDes.dataSourceId) {
                var inputUxDescriptor = this._inputUxDescriptors.get(inputDes.id);
                inputUxDescriptor.dataSource = DataSourceExpression.parse(inputDes.dataSourceId, this._pipelineTemplate.dataSources);

                if (inputUxDescriptor.dataSource) {
                    var dependentUxDesciptorArray = this._getInputDependencyArray(inputUxDescriptor, inputUxDescriptor.dataSource.getInputDependencyArray());
                    if (dependentUxDesciptorArray) {
                        inputUxDescriptor.dataSourceUxInputs.push(...dependentUxDesciptorArray);
                    }
                } else {
                    throw new Error(`Data source {inputDes.dataSourceId} specified for input {inputDes.id} is not present in pipeline template {this._pipelineTemplate.id}`);
                }
            }
        });
    }

    private _setupDefaultInputValue(inputUxDescriptor: InputUxDescriptor): void {
        var inputDes = this._uxInputs.get(inputUxDescriptor.getInputUxDescriptorId());
        if (!inputDes.defaultValue || !InputUxDescriptorUtility.doesExpressionContainsDependency(inputDes.defaultValue)) {
            return;
        }
        var inputUxDescriptor = this._inputUxDescriptors.get(inputDes.id);
        var dependentUxDesciptorArray = this._getInputDependencyArray(inputUxDescriptor, [inputDes.defaultValue], false);

        var defaultValue = this._computeMustacheValue(inputDes.defaultValue, dependentUxDesciptorArray);
        if (defaultValue !== inputUxDescriptor.getParameterValue()) {
            inputUxDescriptor.updateValue(defaultValue);
        }
    }

    
    private _computeMustacheValue(mustacheExpression: string, dependentUxDesciptorArray: InputUxDescriptor[]): string {

        var dependentInputValues = this._getInputParameterValueIfAllSet(dependentUxDesciptorArray);
        if (dependentUxDesciptorArray && dependentUxDesciptorArray.length > 0 && !dependentInputValues) {
            return "";
        } else {
            return MustacheHelper.render(mustacheExpression, { inputs: dependentInputValues });
        }
    }

    private _getInputUxDescriptorValue(inputDes: ExtendedInputDescriptor, inputValues: { [key:string]:any }) {
        if (!!inputValues && !!inputValues[inputDes.id]) {
            return inputValues[inputDes.id];
        } else {
            return !inputDes.defaultValue
            || InputUxDescriptorUtility.doesExpressionContainsDependency(inputDes.defaultValue)
            ? "" : inputDes.defaultValue;
        }
    }

    private _getInputDependencyArray(inputUxDescriptor: InputUxDescriptor, dependencyExpressionArray: string[], allowSelfDependency: boolean = true){
        var dependentInputUxDescriptorArray: InputUxDescriptor[] = [];
        var dependentInputIds: string[] = [];
        for (var dependencyExpression of dependencyExpressionArray) {
            if (dependencyExpression) {
                dependentInputIds = dependentInputIds.concat(InputUxDescriptorUtility.getDependentInputIdList(dependencyExpression));
            }
        }

        if (dependentInputIds.length === 0) {
            return null;
        }

        if (!allowSelfDependency && dependentInputIds.indexOf(inputUxDescriptor.getInputUxDescriptorId()) >= 0) {
            throw new Error(`Input '{inputUxDescriptor.getInputUxDescriptorId()}' has dependency on its own in pipeline template {this._pipelineTemplate.id}.`);
        }

        var uniqueDependentInputIds = dependentInputIds.filter(function (item, pos) {
            return dependentInputIds.indexOf(item) === pos;
        });        

        for (var inputId of uniqueDependentInputIds) {
            var dependentInputUxDescriptor = this._inputUxDescriptors.get(inputId);
            if (dependentInputUxDescriptor) {
                dependentInputUxDescriptorArray.push(dependentInputUxDescriptor);
            } else {
                throw new Error(`Dependent input {inputId} specified for input {inputUxDescriptor.getInputUxDescriptorId()} is not present in pipeline template {this._pipelineTemplate.id}`);
            }
        }
        return dependentInputUxDescriptorArray;
    }

    private _getInputParameterValueIfAllSet(dependentUxDesciptorArray: InputUxDescriptor[], useDisplayValue: boolean = false): StringMap<any> {
        var inputs: StringMap<any> = {};
        if (!dependentUxDesciptorArray) {
            return null;
        }

        for (var dependentUxDesciptor of dependentUxDesciptorArray) {
            if (!dependentUxDesciptor.getParameterValue()) {
                //Value of the parameter is not available, so rest of the input values will be useless.
                throw new Error("Unable to get the input value") ;
            }
            inputs[dependentUxDesciptor.getInputUxDescriptorId()] = dependentUxDesciptor.getParameterValue();
        }
        return inputs;
    }

    private _setInputUxVisibility(inputUxDescriptor: InputUxDescriptor): void {
        var visibilityRule = VisibilityHelper.parseVisibleRule(inputUxDescriptor.getVisibleRule());
        if (visibilityRule !== null && visibilityRule.predicateRules !== null && visibilityRule.predicateRules.length >= 0) {
            var requiredInputs: InputUxDescriptor[] = [];

            visibilityRule.predicateRules.forEach((predicateRule: IPredicate) => {
                try {
                    requiredInputs = requiredInputs.concat([this._inputUxDescriptors.get(predicateRule.inputName)]);
                }
                catch (exception) {
                    //input defined in input visibility does not exist.
                }
            });
            for( let input of requiredInputs){
                var inputDes = this._uxInputs[input.getInputUxDescriptorId()];
                if(inputDes.inputMode === InputMode.RadioButtons){
                    inputUxDescriptor.setVisibilityDependentOnOption(true);
                    break;
                }
            }
            inputUxDescriptor.setInputVisibility(VisibilityHelper.evaluateVisibility(visibilityRule, requiredInputs));
        }
    }
}