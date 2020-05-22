import * as Mustache from 'mustache';

export class MustacheHelper {
    public static getHelperMethods(): any {
        return {

            "equals": function () {
                /*
                 * Usage: {{#equals}}value1 value2 true/false(ignorecase) returnIfTrue returnIfFalse(optional){{/regexReplace}}
                 * {{#equals}}{{{inputs.Input1}}} value1 true value1 'input 1 has invalid input'{{/regexReplace}}
                 */
                return function (text: string, render: any) {
                    var renderedText: string = render(text);
                    var parts = MustacheHelper.getParts(renderedText);
                    if (parts.length < 4) {
                        return "";
                    }

                    var ignoreCase = parts[2];
                    if (ignoreCase) {
                        if (parts[0].toLowerCase() === parts[1].toLowerCase()) {
                            return parts[3];
                        }
                    } else {
                        if (parts[0] === parts[1]) {
                            return parts[3];
                        }
                    }
                    if (parts.length >= 5) {
                        return parts[4];
                    } else {
                        return "";
                    }
                };
            },

            "if": function () {
                /*
                * if returns first parameter if given clause is positive, otherwise second parameter
                * Usage: {{#if}}clause trueValue falseValue{{/if}}
                */
                return function (text: string, render: any) {
                    let parts = MustacheHelper.getParts(text);
                    if (parts.length > 1) {
                        if (render(parts[0]) === "true") {
                            return render(parts[1]);
                        }
                        else {
                            if (parts[2]) {
                                return render(parts[2]);
                            }

                            return "";
                        }
                    }
                };
            },

            "toLower": function () {
                /*
                * converts the string to lower case
                * Usage: {{#toLower}} String to convert to lower case {{/toLower}}
                */
                return function (text: string, render: any) {
                    return render(text).toLowerCase();
                };
            },

            "tinyguid": function () {
                /*
               * Generates 4 character random string
               * Usage: {{#tinyguid}} {{/tinyguid}}
               */
                return function () {
                    return "yxxx".replace(/[xy]/g, function (c) {
                        var r = Math.random() * 16 | 0;
                        var v = c === "x" ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                };
            },

            "sanitizeString": function () {
                /*
                 * Converts string to alphanumeric
                 * Usage: {{#sanitizeString}} String to convert to alphanumeric {{/sanitizeString}}
                 */
                return function (text: string, render: any) {
                    return render(text).replace(/[^a-zA-Z0-9]/g, '');
                };
            },

            "substring": function () {
                /*
                 * Trims given string to specified length
                 * Usage: {{#substring}}'text' from length{{/substring}}
                 * from, length are integers
                 */
                return function (text: string, render: any) {
                    var renderedText = render(text);
                    var parts = MustacheHelper.getParts(renderedText);

                    if (parts.length < 3) {
                        return render("");
                    }
                    else {
                        var from = +parts[1];
                        var length = +parts[2];
                        return render(parts[0].substr(from, length));
                    }
                };
            },

            "parseAzureResourceId": function () {
                return function (text: string, render: any) {
                    var renderedText: string = render(text);
                    var parts = MustacheHelper.getParts(renderedText);
                    if (parts.length !== 2) {
                        return "";
                    }

                    var splitResourceId = parts[0].split("/");
                    var urlResourcePartIndex = parseInt(parts[1]);
                    if (splitResourceId && urlResourcePartIndex && splitResourceId.length > urlResourcePartIndex) {
                        return splitResourceId[urlResourcePartIndex];
                    }

                    return "";
                };
            },

            /*
            * Checks if a string begins with some string
            * Usage: {{#beginsWith}} StringToCheck BeginningPart true/false(for case-sensitivity) IfTrueValue IfFalseValue(optional){{/beginsWith}}
            */
            "beginsWith": function () {
                return function (text: string, render: any) {
                    var renderedText: string = render(text);
                    var parts = MustacheHelper.getParts(renderedText);
                    if (parts.length < 4) {
                        return "";
                    }

                    var ignoreCase = parts[2];
                    if (ignoreCase) {
                        if (parts[0].toLowerCase().startsWith(parts[1].toLowerCase())) {
                            return parts[3];
                        }
                    } else {
                        if (parts[0].startsWith(parts[1])) {
                            return parts[3];
                        }
                    }
                    if (parts.length >= 5) {
                        return parts[4];
                    } else {
                        return "";
                    }
                };
            },

            /*
            * If some variable is the environment variable, adding {{ }}
            * Usage: {{#EnvironmentVariable}} VariableName {{/EnvironmentVariable}}
            */
            "environmentVariable": function () {
                return function (text: string, render: any) {
                    var renderedText: string = render(text);
                    var parts = MustacheHelper.getParts(renderedText);
                    if (parts.length < 1) {
                        return "";
                    }
                    return "{{ " + parts[0] + " }}";
                };
            },

            /*
            * Sort an integer array
            * Usage: {{#intSorter}} IntegerArrayToBeSorted asc/dsc(order in which it is to be sorted) {{/intSorter}}
            */
            "intSorter": function () {
                return function (text: string, render: any) {
                    var parts = MustacheHelper.getParts(text);
                    if (parts.length < 2) {
                        return "";
                    }

                    var order = parts[1].toLowerCase();
                    var arr = render(parts[0]).split(",");
                    var sorter = 1;
                    if (order === "dsc") {
                        sorter = -1;
                    }
                    arr = arr.sort((a, b) => {
                        if (a > b) { return 1 * sorter; }
                        else { return -1 * sorter; }
                    });
                    return arr;
                };
            }
        };
    }

    public static render(mustacheExpression: string, view: any): string {
        view = { ...this.getHelperMethods(), ...view };
        return Mustache.render(mustacheExpression, view);
    }

    public static renderObject(mustacheObject: Object, view: any): any {
        if (typeof (mustacheObject) === "string") {
            return MustacheHelper.render(mustacheObject, view);
        }

        var resultArray: any[] = [];
        if (Array.isArray(mustacheObject)) {
            mustacheObject.forEach(item => {
                resultArray.push(MustacheHelper.renderObject(item, view));
            });
            return resultArray;
        }

        var result: Object = {};
        Object.keys(mustacheObject).forEach(key => {
            if (!!key && !!mustacheObject[key]) {
                result[key] = MustacheHelper.renderObject(mustacheObject[key], view);
            }
        });

        return result;
    }

    public static getParts(text: string): Array<string> {
        var parts: Array<string> = [];
        /* Following regex is to fetch different parts in the text e.g. "test 'hello world' output" => test, 'hello world', output*/
        var fetchPartsRegex = new RegExp(/[\'](.+?)[\']|[^ ]+/g);
        var resultArray;
        while ((resultArray = fetchPartsRegex.exec(text)) !== null) {
            var part = (resultArray[1] === undefined || resultArray[1] === null) ? resultArray[0] : resultArray[1];
            if (part === "''") {
                part = "";
            }
            parts.push(part);
        }

        return parts;
    }
}
