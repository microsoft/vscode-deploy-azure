import { ApplicationSettings } from "azureintegration-repoanalysis-client-internal";
import { ControlProvider } from "../helper/controlProvider";
import { telemetryHelper } from "../helper/telemetryHelper";
import { TracePoints } from "../resources/tracePoints";
import { InputControl } from "./InputControl";

const Layer: string = "RepoAnalysisSettingInputProvider";

export class RepoAnalysisSettingInputProvider {
    private readonly repoAnalysisSettingKey: string = "repoAnalysisSettingKey";
    private _repoAnalysisSettings: ApplicationSettings[];
    private _selectedRepoAnalysisSettingIndex: number;

    constructor(repoAnalysisSettings: ApplicationSettings[]) {
        this._repoAnalysisSettings = repoAnalysisSettings || [];
        this._selectedRepoAnalysisSettingIndex = repoAnalysisSettings.length > 1 ? -1 : 0;
    }

    public inputFromRepoAnalysisSetting(inputControl: InputControl): boolean {
        const repoAnalysisSettingKey = inputControl.getPropertyValue(this.repoAnalysisSettingKey);
        return !!repoAnalysisSettingKey && this._repoAnalysisSettings.length > 0;
    }

    public async setInputControlValueFromRepoAnalysisResult(inputControl: InputControl): Promise<void> {
        let repoAnalysisSettingKey = inputControl.getPropertyValue(this.repoAnalysisSettingKey);
        if (this._selectedRepoAnalysisSettingIndex !== -1) {
            if (!this._repoAnalysisSettings[this._selectedRepoAnalysisSettingIndex].settings[repoAnalysisSettingKey]) {
                let error = new Error(`RepostioryAnalysisSetting doesn't contain ${repoAnalysisSettingKey} for input ${inputControl.getInputControlId()}`);
                telemetryHelper.logError(Layer, TracePoints.SetInputControlValueFromRepoAnalysisResult, error);
                if (inputControl.getInputDescriptor().defaultValue) {
                    let value = inputControl.getInputDescriptor().defaultValue;
                    inputControl.setValue(value);
                } else {
                    let value = await new ControlProvider().showInputBox(repoAnalysisSettingKey, {
                        placeHolder: inputControl.getInputDescriptor().name,
                        validateInput: value => inputControl.triggerControlValueValidations(value)
                    });
                    inputControl.setValue(value);
                }
            } else {
                inputControl.setValue(this._repoAnalysisSettings[this._selectedRepoAnalysisSettingIndex].settings[repoAnalysisSettingKey]);
            }
        } else {
            let settingIndexMap: Map<string, number[]> = new Map();
            this._repoAnalysisSettings.forEach((analysisSetting, index: number) => {
                if (!analysisSetting.settings[repoAnalysisSettingKey]) {
                    return;
                }
                if (settingIndexMap.has(analysisSetting.settings[repoAnalysisSettingKey])) {
                    settingIndexMap.get(analysisSetting.settings[repoAnalysisSettingKey]).push(index);
                } else {
                    settingIndexMap.set(analysisSetting.settings[repoAnalysisSettingKey], [index]);
                }
            });
            if (settingIndexMap.size === 0) {
                let error = new Error(`RepostioryAnalysisSetting doesn't contain ${repoAnalysisSettingKey} for input ${inputControl.getInputControlId()}`);
                telemetryHelper.logError(Layer, TracePoints.SetInputControlValueFromRepoAnalysisResult, error);
                let value = await new ControlProvider().showInputBox(repoAnalysisSettingKey, {
                    placeHolder: inputControl.getInputDescriptor().name,
                    validateInput: value => inputControl.triggerControlValueValidations(value)
                });
                inputControl.setValue(value);
            }
            else {
                let possibleValues = Array.from(settingIndexMap.keys()).map((value) => ({ label: value, data: value }));
                let selectedValue: { label: string, data: any };

                if (possibleValues.length === 1) {
                    selectedValue = possibleValues[0];
                }
                else {
                    // HACK: Temporarily default to first value without asking user. Remove this HACK later and uncomment the next line
                    selectedValue = possibleValues[0];               
                    //selectedValue = await new ControlProvider().showQuickPick(repoAnalysisSettingKey, possibleValues, { placeHolder: inputControl.getInputDescriptor().name });
                }

                if (settingIndexMap.get(selectedValue.data).length === 1) {
                    this._selectedRepoAnalysisSettingIndex = settingIndexMap.get(selectedValue.data)[0];
                }
                inputControl.setValue(selectedValue.data);
            }
        }
    }
}
