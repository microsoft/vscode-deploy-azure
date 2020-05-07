import { InputMode } from "../../model/Contracts";
import { ControlType } from "../../model/models";

export class InputControlUtility {

    public static doesExpressionContainsDependency(expression: string): boolean {
        if (!expression) {
            return false;
        }

        return /{{{inputs\.\w+}}}|{{{system\.\w+}}}|{{{client\.\w+}}}/g.test(expression);
    }

    public static getDependentInputIdList(expression: string): string[] {
        return this._fetchIdsInExpressionByType(expression, DependencyType.Input);
    }

    public static getDependentClientIdList(expression: string): string[] {
        return this._fetchIdsInExpressionByType(expression, DependencyType.Client);
    }

    public static getDependentSystemIdList(expression: string): string[] {
        return this._fetchIdsInExpressionByType(expression, DependencyType.System);
    }

    public static getInputControlType(inputMode: InputMode): ControlType {
        switch (inputMode) {
            case InputMode.None:
            case InputMode.AzureSubscription:
                return ControlType.None;
            case InputMode.TextBox:
            case InputMode.PasswordBox:
                return ControlType.InputBox;
            case InputMode.Combo:
            case InputMode.CheckBox:
            case InputMode.RadioButtons:
                return ControlType.QuickPick;
            default:
                return null;
        }
    }

    private static _fetchIdsInExpressionByType(expression: string, dependencyType: DependencyType): string[] {
        if (!expression) {
            return [];
        }

        var regex;
        switch (dependencyType) {
            case DependencyType.Input:
                regex = /{{{inputs\.(\w+)}}}/g;
                break;

            case DependencyType.System:
                regex = /{{{system\.(\w+)}}}/g;
                break;

            case DependencyType.Client:
                regex = /{{{client\.(\w+)}}}/g;
                break;
        }

        var dependentIds: string[] = [];
        var uniqueDependentIdMap = new Map<string, null>();
        var resultArray;
        while ((resultArray = regex.exec(expression)) !== null) {
            uniqueDependentIdMap.set(resultArray[1], null);
        }

        uniqueDependentIdMap.forEach((value, key) => {
            dependentIds.push(key);
        });
        return dependentIds;
    }
}

enum DependencyType {
    Input,
    System,
    Client
}