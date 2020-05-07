import { MustacheHelper } from "../helper/mustacheHelper";
import { telemetryHelper } from "../helper/telemetryHelper";
import { DataSource, ExtendedInputDescriptor, ExtendedPipelineTemplate, InputDataType, InputDynamicValidation, InputMode } from "../model/Contracts";
import { AzureSession, ControlType, IPredicate, RepositoryAnalysisApplicationSettings, StringMap } from '../model/models';
import { TracePoints } from "../resources/tracePoints";
import { InputControl } from "./InputControl";
import { RepoAnalysisSettingInputProvider } from "./RepoAnalysisSettingInputProvider";
import { DataSourceExpression } from "./utilities/DataSourceExpression";
import { DataSourceUtility } from "./utilities/DataSourceUtility";
import { InputControlUtility } from "./utilities/InputControlUtility";
import { VisibilityHelper } from "./utilities/VisibilityHelper";

const Layer: string = "InputControlProvider";

export class InputControlProvider {
    private _pipelineTemplate: ExtendedPipelineTemplate;
    private _inputControlsMap: Map<string, InputControl>;
    private azureSession: AzureSession;
    private repoAnalysisSettingInputProvider: RepoAnalysisSettingInputProvider;
    private _context: StringMap<any>;

    constructor(azureSession: AzureSession, pipelineTemplate: ExtendedPipelineTemplate, context: StringMap<any>) {
        this._pipelineTemplate = pipelineTemplate;
        this._inputControlsMap = new Map<string, InputControl>();
        this.azureSession = azureSession;
        this.repoAnalysisSettingInputProvider = new RepoAnalysisSettingInputProvider(context['repoAnalysisSettings'] as RepositoryAnalysisApplicationSettings[]);
        this._context = context;
        this._createControls();
    }

    public async overrideParameters(inputControl: InputControl) {
        var properties = inputControl.getPropertyValue(constants.clientPropertyKey);
        var arrayofProperties = Object.keys(properties);

        arrayofProperties.forEach(element => {
            var key = element.split(".", 2)[1];
            var dependentInputControlArray = this._getInputDependencyArray(inputControl, [properties[element]], false);
            var dependentClientInputMap = this._getClientDependencyMap(inputControl, [properties[element]]);
            var newValue = this._computeMustacheValue(properties[element], dependentInputControlArray, dependentClientInputMap);
            inputControl.inputDescriptor[key] = newValue;
            if (key === "inputMode") {
                inputControl.updateInputControlType(parseInt(newValue));
            }
        });
    }

    public async getAllPipelineTemplateInputs(azureSession: AzureSession) {
        let parameters: { [key: string]: any } = {};
        for (let inputControl of this._inputControlsMap.values()) {
            if (this.repoAnalysisSettingInputProvider.inputFromRepoAnalysisSetting(inputControl)) {
                await this.repoAnalysisSettingInputProvider.setInputControlValueFromRepoAnalysisResult(inputControl);
            }
            else if (!!inputControl.getPropertyValue(constants.clientPropertyKey)) {
                this.overrideParameters(inputControl);
            }
            else {
                this._setInputControlVisibility(inputControl);
                this._setupInputControlDefaultValue(inputControl);
                await inputControl.setInputControlValue();
            }
            parameters[inputControl.getInputControlId()] = inputControl.getValue();
        }
        return parameters;
    }

    private _createControls() {
        for (let input of this._pipelineTemplate.inputs) {
            let inputControl: InputControl = null;
            let inputControlValue = this._getInputControlValue(input);

            switch (input.inputMode) {
                case InputMode.None:
                case InputMode.AzureSubscription:
                    if (input.type !== InputDataType.Authorization) {
                        inputControl = new InputControl(input, inputControlValue, ControlType.None, this.azureSession);
                    }
                    break;
                case InputMode.TextBox:
                case InputMode.PasswordBox:
                    inputControl = new InputControl(input, inputControlValue, ControlType.InputBox, this.azureSession);
                    break;
                case InputMode.Combo:
                case InputMode.CheckBox:
                case InputMode.RadioButtons:
                    inputControl = new InputControl(input, inputControlValue, ControlType.QuickPick, this.azureSession);
                    break;

            }
            if (inputControl) {
                this._inputControlsMap.set(input.id, inputControl);
            }
        }
        this._setInputControlDataSourceInputs();
        this._initializeDynamicValidations();
    }

    private _setInputControlDataSourceInputs(inputControl: InputControl): void {
        let inputDes = inputControl.getInputDescriptor();
        if (!!inputDes.dataSourceId) {
            var inputControl = this._inputControlsMap.get(inputDes.id);
            inputControl.dataSource = DataSourceExpression.parse(inputDes.dataSourceId, this._pipelineTemplate.dataSources);

                if (inputControl.dataSource) {
                    var dependentInputControlArray = this._getInputDependencyArray(inputControl, inputControl.dataSource.getInputDependencyArray());
                    if (dependentInputControlArray) {
                        inputControl.dataSourceInputControls.push(...dependentInputControlArray);
                    }
                } else {
                    throw new Error(`Data source ${inputDes.dataSourceId} specified for input ${inputDes.id} is not present in pipeline template ${this._pipelineTemplate.id}`);
                }
            }
        });
    }

    private _initializeDynamicValidations() {
        this._pipelineTemplate.inputs.forEach((inputDes) => {

            var inputControl = this._inputControlsMap.get(inputDes.id);

            if (!!inputControl && !!inputDes.dynamicValidations && inputDes.dynamicValidations.length > 0) {
                var dataSourceToInputsMap = new Map<DataSource, InputControl[]>();
                inputDes.dynamicValidations.forEach((validation: InputDynamicValidation) => {
                    var validationDataSource = DataSourceUtility.getDataSourceById(this._pipelineTemplate.dataSources, validation.dataSourceId);
                    if (validationDataSource) {
                        dataSourceToInputsMap.set(validationDataSource, []);

                        let dynamicValidationRequiredInputIds = DataSourceUtility.getDependentInputIdList(validationDataSource.endpointUrlStem);
                        dynamicValidationRequiredInputIds = dynamicValidationRequiredInputIds.concat(DataSourceUtility.getDependentInputIdList(validationDataSource.requestBody));
                        dynamicValidationRequiredInputIds = dynamicValidationRequiredInputIds.concat(DataSourceUtility.getDependentInputIdList(validationDataSource.resultTemplate));
                        dynamicValidationRequiredInputIds = dynamicValidationRequiredInputIds.concat(DataSourceUtility.getDependentInputIdList(validationDataSource.resultSelector));

                        dynamicValidationRequiredInputIds = Array.from(new Set(dynamicValidationRequiredInputIds));
                        dynamicValidationRequiredInputIds.forEach((dynamicValidationRequiredInputId) => {
                            var dependentInput = this._inputControlsMap.get(dynamicValidationRequiredInputId);
                            if (dependentInput) {
                                dataSourceToInputsMap.get(validationDataSource).push(dependentInput);
                            } else {
                                let error: Error = new Error(`Dependent input ${dynamicValidationRequiredInputId} specified for input ${inputDes.id} is not present in pipeline template ${this._pipelineTemplate.id}`);
                                telemetryHelper.logError(Layer, TracePoints.InitializeDynamicValidation, error);
                            }
                        });
                    } else {
                        let error = new Error(`validation data source ${validation.dataSourceId} specified for input ${inputDes.id} is not present in pipeline template ${this._pipelineTemplate.id}`);
                        telemetryHelper.logError(Layer, TracePoints.InitializeDynamicValidation, error);
                    }
                });
                inputControl.setValidationDataSources(dataSourceToInputsMap);
            }
        });
    }


    private _setupInputControlDefaultValue(inputControl: InputControl): void {
        var inputDes = inputControl.getInputDescriptor();
        if (!inputDes.defaultValue || !InputControlUtility.doesExpressionContainsDependency(inputDes.defaultValue)) {
            return;
        }
        var dependentInputControlArray = this._getInputDependencyArray(inputControl, [inputDes.defaultValue], false);
        var dependentClientInputMap = this._getClientDependencyMap(inputControl, [inputDes.defaultValue]);

        var defaultValue = this._computeMustacheValue(inputDes.defaultValue, dependentInputControlArray, dependentClientInputMap);
        if (defaultValue !== inputControl.getValue()) {
            inputControl.setValue(defaultValue);
        }
    }


    private _computeMustacheValue(mustacheExpression: string, dependentInputControlArray: InputControl[], dependentClientInputMap: StringMap<any>): string {

        var dependentInputValues = this._getInputParameterValueIfAllSet(dependentInputControlArray);
        if (dependentInputControlArray && dependentInputControlArray.length > 0 && !dependentInputValues) {
            return "";
        } else {
            return MustacheHelper.render(mustacheExpression, { inputs: dependentInputValues, client: dependentClientInputMap });
        }
    }

    private _getInputControlValue(inputDes: ExtendedInputDescriptor) {
        if (!!this._context && !!this._context
        [inputDes.id]) {
            return this._context[inputDes.id];
        } else {
            return !inputDes.defaultValue
                || InputControlUtility.doesExpressionContainsDependency(inputDes.defaultValue)
                ? "" : inputDes.defaultValue;
        }
    }
    private _getClientDependencyMap(inputControl: InputControl, dependencyExpressionArray: string[]) {
        var dependentClientControlMap: StringMap<any> = {};
        var dependentClientInputs: string[] = [];
        for (var dependencyExpression of dependencyExpressionArray) {
            if (dependencyExpression) {
                dependentClientInputs = dependentClientInputs.concat(InputControlUtility.getDependentClientIdList(dependencyExpression));
            }
        }

        if (dependentClientInputs.length === 0) {
            return null;
        }

        var uniqueDependentClientInputs = dependentClientInputs.filter(function (item, pos) {
            return dependentClientInputs.indexOf(item) === pos;
        });

        for (var clientInput of uniqueDependentClientInputs) {
            var dependentInputControl = this._context[clientInput];
            if (dependentInputControl) {
                dependentClientControlMap[clientInput] = dependentInputControl;
            } else {
                throw new Error(`Dependent client input ${clientInput} specified is not present in client context.`);
            }
        }
        return dependentClientControlMap;
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
            throw new Error(`Input ${inputControl.getInputControlId()} has dependency on its own in pipeline template ${this._pipelineTemplate.id}.`);
        }

        var uniqueDependentInputIds = dependentInputIds.filter(function (item, pos) {
            return dependentInputIds.indexOf(item) === pos;
        });

        for (var inputId of uniqueDependentInputIds) {
            var dependentInputControl = this._inputControlsMap.get(inputId);
            if (dependentInputControl) {
                dependentInputControlArray.push(dependentInputControl);
            } else {
                throw new Error(`Dependent input ${inputId} specified for input ${inputControl.getInputControlId()} is not present in pipeline template ${this._pipelineTemplate.id}`);
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