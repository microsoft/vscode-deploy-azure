import { InputBoxOptions, QuickPickItem } from 'vscode';
import { IAzureQuickPickOptions } from 'vscode-azureextensionui';
import { telemetryHelper } from '../helper/telemetryHelper';
import { ExtendedInputDescriptor, InputMode } from "../model/Contracts";
import { AzureSession, ControlType, extensionVariables } from '../model/models';
import { Messages } from '../resources/messages';
import { TelemetryKeys } from '../resources/telemetryKeys';
import { DataSourceExpression } from './DataSourceExpression';

export class InputUxDescriptor {
    public dataSource: DataSourceExpression;
    public dataSourceUxInputs: Array<InputUxDescriptor>;
    public dataSourceInputs: Map<string, any>;
    private input: ExtendedInputDescriptor;
    private value: any;
    private controlType: ControlType;
    private visible: boolean;

    constructor(input: ExtendedInputDescriptor, value: any, controlType: ControlType) {
        this.input = input;
        this.value = value;
        this.visible = true;
        this.controlType = controlType;
        this.dataSourceUxInputs = [];
        this.dataSourceInputs = new Map<string, any>();
    }

    public getValue(): any {
        return this.value;
    }

    public setValue(defaultValue: string) {
        this.value = defaultValue;
    }

    public getInputUxDescriptorId(): string {
        return this.input.id;
    }

    public getInputGroupId(): string {
        return this.input.groupId;
    }

    public getInputMode(): InputMode {
        return this.input.inputMode;
    }

    public getParameterValue(): any {
        return this.value;
    }

    public getVisibleRule(): string {
        return this.input.visibleRule;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public setInputVisibility(value: boolean): void {
        this.visible = value;
    }
    
    public async setInputUxDescriptorValue(azureSession: AzureSession): Promise<any> {
        if(!this.isVisible()){
            return;
        }
        if (!!this.dataSource) {
            var inputs = this._getDataSourceInputs();
            if (this.controlType === ControlType.None || this.controlType === ControlType.InputBox) {
                this.value = await this.dataSource.evaluateDataSources(inputs, azureSession);
            }
            else if (this.controlType === ControlType.QuickPick) {
                let selectedValue = await this.dataSource.evaluateDataSources(inputs, azureSession)
                    .then((listItems: Array<{ label: string, data: any, group?: string }>) => {
                        return this.showQuickPick(this.getInputUxDescriptorId(), listItems, { placeHolder: this.input.name });
                    });
                this.value = selectedValue.data;
            }
        } 
        else {
            if (this.controlType === ControlType.QuickPick) {
                var listItems: Array<{ label: string, data: any }> = [];
                if (!!this.input.possibleValues && this.input.possibleValues.length > 0) {
                    this.input.possibleValues.forEach((item) => {
                        listItems.push({ label: item.displayValue, data: item.value });
                    });
                } 
                else if(this.input.inputMode === InputMode.RadioButtons){
                    listItems.push({ label: "Yes", data: "true" });
                    listItems.push({ label: "No", data: "false" });
                }
                this.value = (await this.showQuickPick(this.getInputUxDescriptorId(), listItems, { placeHolder: this.input.name })).data;
            }
            else if (this.controlType === ControlType.InputBox) {
                this.value = await this.showInputBox( this.getInputUxDescriptorId(), { 
                    placeHolder: this.input.name,
                    validateInput: (inputValue) => {
                        return !inputValue ? Messages.valueRequired : null;      
                    } 
                });
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