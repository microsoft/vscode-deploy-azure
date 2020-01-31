
import * as Mustache from 'mustache';


export class MustacheHelper {
    public static getHelperMethods(): any {
        return {
            "toLower": function () {
                return function (text: string, render: any) {
                    return render(text).toLowerCase();
                }
            },

            "tinyguid": function () {
                return "yxxx".replace(/[xy]/g, function (c) {
                    var r = Math.random() * 16 | 0;
                    var v = c === "x" ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            },

            "sanitizeString": function(){
                return function (text: string, render: any) {

                }


            },

            "if":function(){
                return function (text: string, render: any) {
                    if (render(text))
                        return true;
                    else
                        return false;
                }

            }

            

            // "toAlphaNumeric": function () {
            //     return function (text: string, render: any) {
            //         return render(text).replace(/[^a-zA-Z0-9]/g, '');
            //     }
            // },

            // "substring": function () {
            //     /*
            //      * Trims given string to specified length
            //      * Usage: {{#substring}}'text' from length{{/substring}}
            //      * from, length are integers
            //      */
            //     return function (text: string, render: any) {
            //         var renderedText = render(text);
            //         var parts = MustacheHelper.getParts(renderedText);

            //         if (parts.length < 3) return render("");
            //         var from = +parts[1];
            //         var length = +parts[2];
            //         return render(parts[0].substr(from, length));
            //     }
            // },

            "simplehash": function () {
                return function (text: string, render: any) {
                    var renderedText = render(text);
                    var parts = MustacheHelper.getParts(renderedText);

                    var seed = parts[0];
                    var stack = "qpowieurytlaksjdhfgzmxncbv0291867354";
                    var result = "";
                    var sum = 0;
                    for (var i = 0; i < seed.length; i++) sum += (i + 1) * (seed.charCodeAt(i));
                    for (var i = 0; i < 4; i++) result += stack.charAt((sum + 7 * i) % 36);
                    return render(result);
                }
            },

            "regexReplace": function () {
                /*
                 * Usage: {{#regexReplace}}'text' 'regex_literal' 'new_value'{{/regexReplace}}
                 * regex_literal can have modifiers e.g. /g, /i
                 */
                return function (text: string, render: any) {
                    var renderedText = render(text);
                    var parts = MustacheHelper.getParts(renderedText);

                    if (parts.length != 3) {
                        return "";
                    }

                    //parts[1] will be regex
                    var flags = parts[1].replace(/.*\/([gimy]*)$/, '$1');
                    var pattern = parts[1].replace(new RegExp('^/(.*?)/' + flags + '$'), '$1');
                    var regex = new RegExp(pattern, flags);

                    return parts[0].replace(regex, parts[2]);
                }
            },           

            "parseAzureResourceId": function () {
                return function (text: string, render: any) {
                    var renderedText: string = render(text);
                    var parts = MustacheHelper.getParts(renderedText);
                    if (parts.length != 2) {
                        return "";
                    }

                    var splitResourceId = parts[0].split("/");
                    var urlResourcePartIndex = NumberUtils.parseInvariant(parts[1]);
                    if (splitResourceId && urlResourcePartIndex && splitResourceId.length > urlResourcePartIndex) {
                        return splitResourceId[urlResourcePartIndex];
                    }

                    return "";
                }
            },

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

                    var ignoreCase = TFS_Core.BoolUtils.parse(parts[2]);

                    if (!ignoreCase) {
                        if (TFS_Core.StringUtils.defaultComparer(parts[0], parts[1]) === 0) {
                            return parts[3];
                        }
                    } else {
                        if (TFS_Core.StringUtils.ignoreCaseComparer(parts[0], parts[1]) === 0) {
                            return parts[3];
                        }
                    }

                    if (parts.length >= 5) {
                        return parts[4];
                    } else {
                        return "";
                    }
                }
            },

            "isCoresQuotaAvailable": function () {
                /*
                 * Returns: true/false if required number of cores are available in the region.
                 * Usage:{{#isCoresQuotaAvailable}}{{{CoresLimit}}} {{{CoresCurrentlyInUse}}} {{{CoresRequiredPerVM}}} {{{NumberOfVMsRequired}}}{{/isCoresQuotaAvailable}}
                 */
                return function (text: string, render: any) {
                    var renderedText: string = render(text);
                    var parts = MustacheHelper.getParts(renderedText);
                    if (parts.length < 3) {
                        return true;
                    }

                    var coresLimit: number = NumberUtils.parseInvariant(parts[0]) || 100;
                    var currentlyUsedCores: number = NumberUtils.parseInvariant(parts[1]) || 0;
                    var availableCores: number = coresLimit - currentlyUsedCores;

                    var coresInformationForVM = Specs.getFeatureForVM("cores", parts[2]);
                    var requiredCoresPerVM: number = coresInformationForVM && coresInformationForVM.displayValue ? NumberUtils.parseInvariant(coresInformationForVM.displayValue.toString()) : 2;
                    var numberOfVMs: number = NumberUtils.parseInvariant(parts[3] || "1");

                    var result = (availableCores - (requiredCoresPerVM * numberOfVMs)) >= 0;
                    if (!result) {
                        FxTelemetry.trace({
                            source: AzureProjectConstants.AzureProjectTelemetrySource,
                            action: "isCoresQuotaAvailable",
                            data: {
                                coresLimit: coresLimit,
                                usedCores: currentlyUsedCores,
                                VMSize: parts[2] || requiredCoresPerVM,
                                numberOfVMs: numberOfVMs
                            }
                        });
                    }

                    return result;
                }
            }
        }
    }

    public static render(mustacheExpression: string, view: any): string {
        view = { ...this.getHelperMethods(), ...view };
        return Mustache.render(mustacheExpression, view);
    }

    public static renderObject(mustacheObject: Object, view: any): any {
        if (typeof (mustacheObject) == "string") {
            return MustacheHelper.render(mustacheObject, view);
        }

        var resultArray: any[] = [];
        if (Array.isArray(mustacheObject)) {
            mustacheObject.forEach(item => {
                resultArray.push(MustacheHelper.renderObject(item, view));
            })
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
        while ((resultArray = fetchPartsRegex.exec(text)) != null) {
            var part = MsPortalFx.isNullOrUndefined(resultArray[1]) ? resultArray[0] : resultArray[1];
            if (part == "''") {
                part = "";
            }
            parts.push(part);
        }

        return parts;
    }
}
