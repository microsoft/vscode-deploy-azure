export class InputControlUtility {

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
    System
}