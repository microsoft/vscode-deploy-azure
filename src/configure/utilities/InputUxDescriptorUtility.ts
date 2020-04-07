import { InputUxDescriptor } from "./InputUxDescriptor";

export class InputUxDescriptorUtility {
    
    public static getUxDescriptorsValues(inputUxDescriptors: Map<string, InputUxDescriptor>): Map<string,any> {
        var params: Map<string,any> = new Map<string,any>();

        inputUxDescriptors.forEach((inputUxDescriptor, id) => {
            params[id] = inputUxDescriptor.getParameterValue();
        });

        return params;
    }

    public static updateUxDescriptorsValues(inputUxDescriptors: Map<string, InputUxDescriptor>, values: Map<string,any>): void {
        inputUxDescriptors.forEach((inputUxDescriptor, id) => {
            if (!!values[id]) {
                //inputUxDescriptor.updateValue(values[id]);
            }
        });
    }

    public static getUxDescriptorsStringValues(inputUxDescriptors: Map<string, InputUxDescriptor>): Map<string,string> {
        var params: Map<string,string> = new Map<string,string>();

        inputUxDescriptors.forEach((inputUxDescriptor, id) => {
            params[id] = inputUxDescriptor.getParameterValue();
        });

        return params;
    }

    public static doesExpressionContainsDependency(expression: string): boolean {
        if (!expression) {
            return false;
        }

        return /{{{inputs\.\w+}}}|{{{system\.\w+}}}/g.test(expression);
    }

    public static getDependentInputIdList(expression: string): string[] {
        return this._fetchIdsInExpressionByType(expression, DependencyType.Input);
    }

    public static getDependentSystemIdList(expression: string): string[] {
        return this._fetchIdsInExpressionByType(expression, DependencyType.System);
    }

    private static _fetchIdsInExpressionByType(expression: string, type: DependencyType): string[] {
        if (!expression) {
            return [];
        }

        var regex;
        switch (type) {
            case DependencyType.Input:
                regex = /{{{inputs\.(\w+)}}}/g;
                break;

            case DependencyType.System:
                regex = /{{{system\.(\w+)}}}/g;
                break;
        }

        var dependentIds: string[] = [];
        var uniqueDependentIdMap = new Map<string, null>();
        var resultArray;
        while ((resultArray = regex.exec(expression)) != null) {
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
    System
};