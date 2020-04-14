import { InputBoxOptions, QuickPickItem } from 'vscode';
import { IAzureQuickPickOptions } from 'vscode-azureextensionui';
import { ExtendedInputDescriptor, InputMode } from "../model/Contracts";
import { AzureSession, ControlType, extensionVariables } from '../model/models';
import { Messages } from '../resources/messages';
import { DataSourceExpression } from './DataSourceExpression';

export class InputUxDescriptor {

    private _input: ExtendedInputDescriptor;
    private _value: any;
    private _controlType: ControlType;
    private _isVisible: boolean;
    public dataSource: DataSourceExpression;
    public dataSourceUxInputs: Array<InputUxDescriptor>;
    public dataSourceInputs: Map<string, any>;

    constructor(input: ExtendedInputDescriptor, value: any, controlType: ControlType) {
        this._input = input;
        this._value = value;
        this._isVisible = true;
        this._controlType = controlType;
        this.dataSourceUxInputs = [];
        this.dataSourceInputs = new Map<string, any>();
    }

    public async setInputUxDescriptorValue(azureSession: AzureSession): Promise<any> {
        if (!!this.dataSource && !this._value) {
            var inputs = this._getDataSourceInputs();
            if (this._controlType === ControlType.None) {
                this._value = await this.dataSource.evaluateDataSources(inputs, azureSession);
            }
            else if (this._controlType === ControlType.QuickPick && this.IsVisible()) {
                let selectedValue = await this.dataSource.evaluateDataSources(inputs, azureSession)
                    .then((listItems: Array<{ label: string, data: any, group?: string }>) => {
                        if (this.IsVisible()) {
                            return this.showQuickPick(listItems, { placeHolder: this._input.description });
                        }
                        return listItems[0];
                    });
                //validation
                this._value = selectedValue.data;

            }
        } else if (this.IsVisible()) {
            if (this._controlType === ControlType.QuickPick && !!this._input.possibleValues && this._input.possibleValues.length > 0) {
                var listItems: Array<{ label: string, data: any }> = [];
                this._input.possibleValues.forEach((item) => {
                    listItems.push({ label: item.displayValue, data: item.value });
                });
                let selectedValue = await this.showQuickPick(listItems, { placeHolder: this._input.description });
                this._value = selectedValue.data;

            }
            else if (this._controlType === ControlType.InputBox && this._input.isRequired) {
                this._value = await this.showInputBox({ 
                    placeHolder: this._input.description,
                    validateInput: (inputValue) => {
                        return !inputValue ? Messages.valueRequired : null;
                    } 
                });
            }
            else if (this._controlType === ControlType.InputBox) {
                this._value = await this.showInputBox({ 
                    placeHolder: this._input.description});
            }
        }
    }


    private _getDataSourceInputs(): { [key: string]: any } {
        var inputs: { [key: string]: any } = {};
        for (var dataSourceInput of this.dataSourceUxInputs) {
            inputs[dataSourceInput.getInputUxDescriptorId()] = dataSourceInput.getParameterValue();
        }
        return inputs;
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

    public getVisibleRule(): string {
        return this._input.visibleRule;
    }

    public IsVisible(): boolean {
        return this._isVisible;
    }

    public setInputVisibility(value: boolean): void {
        this._isVisible = value;
    }

    private async showQuickPick<T extends QuickPickItem>(listItems: T[] | Thenable<T[]>, options: IAzureQuickPickOptions, itemCountTelemetryKey?: string): Promise<T> {
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

    private async showInputBox(options: InputBoxOptions): Promise<string> {
        //telemetryHelper.setTelemetry(TelemetryKeys.CurrentUserInput, inputName);
        return await extensionVariables.ui.showInputBox(options);
    }
}