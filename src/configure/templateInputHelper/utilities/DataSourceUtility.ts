import { JSONPath } from 'jsonpath-plus';
import { isNullOrUndefined } from 'util';
import { ArmRestClient } from "../../clients/azure/armRestClient";
import { Cache } from '../../helper/Cache';
import { MustacheHelper } from "../../helper/mustacheHelper";
import { DataSource } from "../../model/Contracts";
import { AzureSession, QuickPickItemWithData, StringMap } from "../../model/models";

export class DataSourceUtility {

    public static getDependentInputIdList(dataSourceEndpointUrl: string): string[] {
        var inputIds: string[] = [];
        if (!!dataSourceEndpointUrl) {
            var dependentInputs = dataSourceEndpointUrl.match(/\{\{\{inputs.\w+\}\}\}/g);
            if (!!dependentInputs) {
                dependentInputs.forEach((value) => {
                    var startIndex = value.indexOf("{{{inputs.") + "{{{inputs.".length;
                    var endIndex = value.indexOf("}}}");
                    var inputId = value.substring(startIndex, endIndex);
                    inputIds.push(inputId);
                });
            }
        }

        return inputIds;
    }

    public static getDataSourceById(dataSources: Array<DataSource>, dataSourceId: string) {
        for (var dataSource of dataSources) {
            if (dataSource.id === dataSourceId) {
                return dataSource;
            }
        }
        return null;
    }

    public static async evaluateDataSource(dataSource: DataSource, inputs: StringMap<any>, azureSession: AzureSession): Promise<any> {

        var view = { inputs: inputs };
        var armUri = MustacheHelper.render(dataSource.endpointUrlStem, view);
        var httpMethod = dataSource.httpMethod || "GET";
        const requestBody = !!dataSource.requestBody ? MustacheHelper.render(dataSource.requestBody, view) : null;
        const armClient = new ArmRestClient(azureSession);
        let result: any;
        if (httpMethod == "GET" && Cache.getCache().getValue(armUri)) {
            result = Cache.getCache().getValue(armUri);
        } else {
            result = await armClient.fetchArmData(armUri, httpMethod, JSON.parse(requestBody));
            if (httpMethod == "GET") {
                Cache.getCache().put(armUri, result);
            }
        }
        return this.evaluateDataSourceResponse(dataSource, result, view);
    }

    private static evaluateDataSourceResponse(dataSource: DataSource, response: any, view: { inputs: StringMap<any> }): any {
        if (!!dataSource.resultSelector) {
            const resultSelector = MustacheHelper.render(dataSource.resultSelector, view);
            response = JSONPath({ json: response, path: resultSelector, wrap: false, flatten: true });
            if (response === "" || response === isNullOrUndefined) {
                return null;
            }
        }

        if (Array.isArray(response)) {
            var quickPickItems: Array<QuickPickItemWithData> = [];

            if (!!dataSource.resultTemplate) {
                // Apply resultTemplate to each element in the Array
                for (let item of response) {
                    if (typeof item === 'string' || item instanceof String) {
                        item = { "result": item };
                    }
                    var resultObj = JSON.parse(MustacheHelper.render(dataSource.resultTemplate, { ...view, ...item }));
                    quickPickItems.push({ label: resultObj.DisplayValue, data: resultObj.Value });
                }
            }
            else {
                for (let item of response) {
                    quickPickItems.push({ label: item, data: item });
                }
            }

            return quickPickItems;
        }
        else {
            if (!!dataSource.resultTemplate) {
                response = MustacheHelper.render(dataSource.resultTemplate, { ...view, ...response });
            }

            return response;
        }
    }
}