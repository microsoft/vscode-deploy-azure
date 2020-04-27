import { InputBoxOptions, QuickPickItem } from 'vscode';
import { IAzureQuickPickOptions } from 'vscode-azureextensionui';
import { MustacheHelper } from '../helper/mustacheHelper';
import { telemetryHelper } from '../helper/telemetryHelper';
import { ExtendedInputDescriptor, InputMode } from "../model/Contracts";
import { AzureSession, ControlType, extensionVariables, StringMap } from '../model/models';
import { Messages } from '../resources/messages';
import { TelemetryKeys } from '../resources/telemetryKeys';
import { DataSourceExpression } from './utilities/DataSourceExpression';

export class InputControl {
    public dataSource: DataSourceExpression;
    public dataSourceInputControls: Array<InputControl>;
    public dataSourceInputs: Map<string, any>;
    private inputDescriptor: ExtendedInputDescriptor;
    private value: any;
    private controlType: ControlType;
    private visible: boolean;

    constructor(inputDescriptor: ExtendedInputDescriptor, value: any, controlType: ControlType) {
        this.inputDescriptor = inputDescriptor;
        this.value = value;
        this.visible = true;
        this.controlType = controlType;
        this.dataSourceInputControls = [];
        this.dataSourceInputs = new Map<string, any>();
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

    public async setInputControlValue(azureSession: AzureSession): Promise<any> {
        if (!this.isVisible()) {
            return;
        }
        if (!!this.dataSource) {
            var dependentInputs = this._getDataSourceInputs();
            if (this.controlType === ControlType.None || this.controlType === ControlType.InputBox) {
                this.value = await this.dataSource.evaluateDataSources(dependentInputs, azureSession);
            }
            else if (this.controlType === ControlType.QuickPick) {
                let selectedValue = await this.showQuickPick(this.getInputControlId(),
                    this.dataSource.evaluateDataSources(dependentInputs, azureSession)
                        .then((listItems: Array<{ label: string, data: any, group?: string }>) => listItems),
                    { placeHolder: this.inputDescriptor.name });
                this.value = selectedValue.data;
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
                this.value = (await this.showQuickPick(this.getInputControlId(), listItems, { placeHolder: this.inputDescriptor.name })).data;
            }
            else if (this.controlType === ControlType.InputBox) {
                this.value = await this.showInputBox(this.getInputControlId(), {
                    placeHolder: this.inputDescriptor.name,
                    validateInput: (inputValue) => {
                        return !inputValue ? Messages.valueRequired : null;
                    }
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

    private _getDataSourceInputs(): { [key: string]: any } {
        var inputs: { [key: string]: any } = {};
        for (var dataSourceInput of this.dataSourceInputControls) {
            inputs[dataSourceInput.getInputControlId()] = dataSourceInput.getValue();
        }
        return inputs;
    }

    private async showQuickPick<T extends QuickPickItem>(listName: string, listItems: T[] | Thenable<T[]>, options: IAzureQuickPickOptions, itemCountTelemetryKey?: string): Promise<T> {
        try {
            telemetryHelper.setTelemetry(TelemetryKeys.CurrentUserInput, listName);
            return await extensionVariables.ui.showQuickPick(listItems, options);
        }
        finally {
            if (itemCountTelemetryKey) {
                telemetryHelper.setTelemetry(itemCountTelemetryKey, (await listItems).length.toString());
            }
        }
    }

    private async showInputBox(inputName: string, options: InputBoxOptions): Promise<string> {
        telemetryHelper.setTelemetry(TelemetryKeys.CurrentUserInput, inputName);
        return await extensionVariables.ui.showInputBox(options);
    }
}