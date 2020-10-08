import { ApplicationSettings } from "azureintegration-repoanalysis-client-internal";
import { ControlProvider } from "../helper/controlProvider";
import { telemetryHelper } from "../helper/telemetryHelper";
import { InputDataType } from "../model/Contracts";
import { TracePoints } from "../resources/tracePoints";
import { InputControl } from "./InputControl";

const Layer: string = "RepoAnalysisSettingInputProvider";

export class RepoAnalysisSettingInputProvider {
    private readonly repoAnalysisSettingKey: string = "repoAnalysisSettingKey";
    private repoAnalysisSettings: ApplicationSettings[];
    private selectedRepoAnalysisSettingIndex: number;

    constructor(repoAnalysisSettings: ApplicationSettings[]) {
        this.repoAnalysisSettings = repoAnalysisSettings || [];
        this.selectedRepoAnalysisSettingIndex = repoAnalysisSettings.length > 1 ? -1 : 0;
    }

    public inputFromRepoAnalysisSetting(inputControl: InputControl): boolean {
        const repoAnalysisSettingKey = inputControl.getPropertyValue(this.repoAnalysisSettingKey);
        return !!repoAnalysisSettingKey && this.repoAnalysisSettings.length > 0;
    }

    public async setInputControlValueFromRepoAnalysisResult(inputControl: InputControl): Promise<void> {
        const repoAnalysisSettingKey = inputControl.getPropertyValue(this.repoAnalysisSettingKey);
        if (this.selectedRepoAnalysisSettingIndex !== -1) {
            let value = this.repoAnalysisSettings[this.selectedRepoAnalysisSettingIndex].settings[repoAnalysisSettingKey];
            if (!value || (Array.isArray(value) && value.length === 0)) {
                await this.setValueIfNotPresentInRepoAnalysis(inputControl, repoAnalysisSettingKey);
            } else {
                if (Array.isArray(value)) {
                    let selectedValue = value[0];
                    if (value.length > 1) {
                        const possibleValues = value.map((element) => ({ label: element, data: element }));

                        selectedValue = (await new ControlProvider().showQuickPick(repoAnalysisSettingKey, possibleValues, {
                            placeHolder: inputControl.getInputDescriptor().name,
                        })).data;
                    }
                    value = selectedValue;
                }
                inputControl.setValue(value);
            }
        } else {
            const settingIndexMap: Map<string, number[]> = new Map();
            this.repoAnalysisSettings.forEach((analysisSetting, index: number) => {
                if (!analysisSetting.settings[repoAnalysisSettingKey]) {
                    return;
                }
                let keyValue = analysisSetting.settings[repoAnalysisSettingKey];
                if (Array.isArray(keyValue)) {
                    if (keyValue.length === 0) {
                        return;
                    }
                    keyValue = keyValue.toString();
                }

                if (settingIndexMap.has(keyValue)) {
                    settingIndexMap.get(keyValue).push(index);
                } else {
                    settingIndexMap.set(keyValue, [index]);
                }
            });
            if (settingIndexMap.size === 0) {
                await this.setValueIfNotPresentInRepoAnalysis(inputControl, repoAnalysisSettingKey);
            } else {
                let possibleValues = Array.from(settingIndexMap.keys()).map((value) => ({ label: value, data: value }));
                let selectedValue: { label: string, data: any };

                if (possibleValues.length === 1) {
                    selectedValue = possibleValues[0];
                }
                else {
                    // HACK: Temporarily default to first value without asking user. Remove this HACK later and uncomment the next line
                    selectedValue = possibleValues[0];
                    // selectedValue = await new ControlProvider().showQuickPick(repoAnalysisSettingKey, possibleValues, { placeHolder: inputControl.getInputDescriptor().name });
                }
                if (settingIndexMap.get(selectedValue.data).length === 1) {
                    this.selectedRepoAnalysisSettingIndex = settingIndexMap.get(selectedValue.data)[0];
                }

                const repoAnalysisValue = this.repoAnalysisSettings[settingIndexMap.get(selectedValue.data)[0]].settings[repoAnalysisSettingKey];
                if (inputControl.getInputDataType() === InputDataType.String && Array.isArray(repoAnalysisValue)) {
                    possibleValues = repoAnalysisValue.map((value) => ({ label: value, data: value }));
                    if (possibleValues.length === 1) {
                        selectedValue = possibleValues[0];
                    } else {
                        selectedValue = await new ControlProvider().showQuickPick(repoAnalysisSettingKey, possibleValues, { placeHolder: inputControl.getInputDescriptor().name });
                    }
                }
                inputControl.setValue(selectedValue.data);
            }
        }
    }

    private async setValueIfNotPresentInRepoAnalysis(inputControl: InputControl, repoAnalysisSettingKey: string): Promise<void> {
        const error = new Error(`RepostioryAnalysisSetting doesn't contain ${repoAnalysisSettingKey} for input ${inputControl.getInputControlId()}`);
        telemetryHelper.logError(Layer, TracePoints.SetInputControlValueFromRepoAnalysisResult, error);
        let value = inputControl.getInputDescriptor().defaultValue;
        if (!value) {
            value = await new ControlProvider().showInputBox(repoAnalysisSettingKey, {
                placeHolder: inputControl.getInputDescriptor().name,
                validateInput: (v) => inputControl.triggerControlValueValidations(v)
            });
        }
        return inputControl.setValue(value);
    }
}
