import { DataSource } from "../model/Contracts";
import { AzureSession } from "../model/models";
import { DataSourceUtility } from "./DataSourceUtility";

export class DataSourceExpression {
    public operator: Operator;
    public leftChild?: DataSourceExpression;
    public rightChild?: DataSourceExpression;
    public value?: string;

    private _dataSources: DataSource[] = [];

    // Parses a dataSourceId string into an expression based on operators present in the id.
    // NOTE: Currently only a simple expression of type "expr1 OPERATOR expr2" is supported.
    public static parse(dataSourceId: string, dataSources: DataSource[]): DataSourceExpression {
        this._validateDataSourceId(dataSourceId);
        var id: string = dataSourceId.trim();
        var parts: any[] = DataSourceExpression._splitByOperator(id);
        if (parts.length > 1) {
            var leftChild: DataSourceExpression = DataSourceExpression.parse(parts[0].trim(), dataSources);
            var rightChild: DataSourceExpression = DataSourceExpression.parse(parts[1].trim(), dataSources);
            if (!leftChild && !rightChild) {
                return null;
            }

            return new DataSourceExpression(
                parts[2],
                leftChild,
                rightChild,
                null,
                dataSources);
        }

        if (!DataSourceUtility.getDataSourceById(dataSources, parts[0])) {
            return null;
        }

        return new DataSourceExpression(
            Operator.UNDEFINED,
            null,
            null,
            parts[0],
            dataSources);
    }

    public getInputDependencyArray(): string[] {
        if (this.operator === Operator.UNDEFINED) {
            var dataSource = DataSourceUtility.getDataSourceById(this._dataSources, this.value);
            return [dataSource.endpointUrlStem, dataSource.requestBody, dataSource.resultSelector, dataSource.resultTemplate];
        }

        var leftDependencyArray: string[] = [];
        var rightDependencyArray: string[] = [];
        if (this.leftChild) {
            leftDependencyArray = this.leftChild.getInputDependencyArray();
        }

        if (this.rightChild) {
            rightDependencyArray = this.rightChild.getInputDependencyArray();
        }

        return leftDependencyArray.concat(rightDependencyArray);
    }

    public async evaluateDataSources(inputs: { [key: string]: any }, azureSession: AzureSession): Promise<any> {
        var dataPromises: Promise<any>[] = [];

        if (this.operator === Operator.UNDEFINED) {
            var dataSource = DataSourceUtility.getDataSourceById(this._dataSources, this.value);
            return DataSourceUtility.evaluateDataSource(dataSource, inputs, azureSession);
        }

        if (this.leftChild) {
            dataPromises.push(this.leftChild.evaluateDataSources(inputs, azureSession));
        }

        if (this.rightChild) {
            dataPromises.push(this.rightChild.evaluateDataSources(inputs, azureSession));
        }

        return Promise.all(dataPromises).then((result: any[]) => {
            // If one of the data source evaluates to an array while other evaluates to a string, then take the array
            if (Array.isArray(result[0]) && !Array.isArray(result[1])) {
                return result[0];
            }

            if (Array.isArray(result[1]) && !Array.isArray(result[0])) {
                return result[1];
            }

            // If both data sources evaluate to string, then take the first one
            if (!Array.isArray(result[0]) && !Array.isArray(result[1])) {
                return result[0];
            }

            if (Array.isArray(result[0]) && Array.isArray(result[1])) {
                return DataSourceExpression._applyOperator(this.operator, result[0], result[1]);
            }
        });
    }

    private constructor(operator: Operator, leftChild: DataSourceExpression, rightChild: DataSourceExpression, value: string, dataSources: DataSource[]) {
        this.operator = operator;
        this.leftChild = leftChild;
        this.rightChild = rightChild;
        this.value = value;
        this._dataSources = dataSources;
    }

    private static _applyOperator(
        operator: Operator, array1: Array<{ text: string, value: any, group?: string }>,
        array2: Array<{ text: string, value: any, group?: string }>): Array<{ text: string, value: any, group?: string }> {

        switch (operator) {
            case Operator.INTERSECT:
                return array1.filter(item1 => {
                    return array2.some((item2) => {
                        return item2.value.toLowerCase() === item1.value.toLowerCase()
                            && ((!item2.group && !item1.group) || item2.group.toLowerCase() === item1.group.toLowerCase());
                    });
                });
            default:
                var error: string = `Data sources do not support operator ${operator}. Supported operators are: INTERSECT`;
                //PipelineTemplateErrorLogger.logError(error);
                throw error;
        }
    }

    private static _splitByOperator(id: string): any[] {
        var operators: string[] = Object.keys(Operator).filter(k => typeof Operator[k as any] === "number" && k !== "UNDEFINED");
        var parts: string[] = [];
        operators.forEach((operator: string) => {
            var delimiter: string = " " + operator + " ";
            if (id.indexOf(delimiter) !== -1) {
                parts = id.split(delimiter);
                parts[2] = Operator[operator as any];
                return;
            }
        });

        if (parts.length === 0) {
            return [id];
        } else {
            return parts;
        }
    }

    private static _validateDataSourceId(dataSourceId: string): void {
        var error: string;
        if (!dataSourceId) {
            error = "DataSourceId should not be null or empty";
        }

        var parts: string[] = dataSourceId.trim().split(" ");
        if (parts.length > 1 && parts.length !== 3) {
            error = "Invalid DataSourceId. It does not support multiple operators. It should be of format 'expression' or 'expression1 [OPERATOR] expression2'";
        }

        if (dataSourceId.startsWith('(') || dataSourceId.endsWith(')')) {
            error = "Invalid DataSourceId. It should not start or end with braces";
        }

        if (error) {
            //PipelineTemplateErrorLogger.logError(error);
            throw new Error(error);
        }
    }
}

export enum Operator {
    UNDEFINED = 0,
    INTERSECT = 1
}