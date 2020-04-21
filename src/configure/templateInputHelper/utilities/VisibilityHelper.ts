import { IPredicate, IVisibilityRule } from "../../model/models";
import { InputControl } from "../InputControl";

const Operator_AND: string = "&&";
const Operator_OR: string = "||";

export class VisibilityHelper {
    public static parseVisibleRule(visibleRule: string): IVisibilityRule {
        let rule: IVisibilityRule = null;
        if (visibleRule) {
            if (visibleRule.indexOf(Operator_AND) !== -1) {
                let rules = visibleRule.split(Operator_AND);
                let predicateRules = rules.map(this.getPredicateRule);
                rule = {
                    operator: Operator_AND,
                    predicateRules: predicateRules
                };
            } else if (visibleRule.indexOf(Operator_OR) !== -1) {
                let rules = visibleRule.split(Operator_OR);
                let predicateRules = rules.map(this.getPredicateRule);
                rule = {
                    operator: Operator_OR,
                    predicateRules: predicateRules
                };
            } else {
                let predicateRule = this.getPredicateRule(visibleRule);
                rule = {
                    operator: null,
                    predicateRules: [predicateRule]
                };
            }
        }

        return rule;
    }

    public static evaluateVisibility(visibilityRule: IVisibilityRule, dependentInputs: InputControl[]): boolean {
        let result: boolean = visibilityRule.operator === Operator_AND;

        for (let i = 0, len = visibilityRule.predicateRules.length; i < len; i++) {
            let predicateRule = visibilityRule.predicateRules[i];
            let dependentInput: InputControl = dependentInputs.find((dependentInput: InputControl) => {
                return dependentInput.getInputControlId() === predicateRule.inputName;
            });

            if (dependentInput) {
                let isInputVisible = dependentInput.isVisible();
                if (!isInputVisible) {
                    result = this._evaluate(result, isInputVisible, visibilityRule.operator);
                } else {
                    let predicateResult = this._getPredicateResult(predicateRule, dependentInput.getValue());
                    result = this._evaluate(result, predicateResult, visibilityRule.operator);
                }
            } else {
                result = false;
                break;
            }
        }
        return result;
    }

    private static getPredicateRule(visibleRule: string): IPredicate {
        let reg = /([a-zA-Z0-9 ]+)([!=<>]+)([a-zA-Z0-9. ]+)|([a-zA-Z0-9 ]+(?=NotContains|NotEndsWith|NotStartsWith))(NotContains|NotEndsWith|NotStartsWith)([a-zA-Z0-9. ]+)|([a-zA-Z0-9 ]+(?=Contains|EndsWith|StartsWith))(Contains|EndsWith|StartsWith)([a-zA-Z0-9. ]+)/g;
        let rule: IPredicate = null;
        let matches = reg.exec(visibleRule);
        if (matches && matches.length === 10) {
            if (!!matches[1]) {
                rule = {
                    inputName: matches[1].trim(),
                    condition: matches[2].trim(),
                    inputValue: matches[3].trim()
                };
            } else if (!!matches[4]) {
                rule = {
                    inputName: matches[4].trim(),
                    condition: matches[5].trim(),
                    inputValue: matches[6].trim()
                };
            } else {
                rule = {
                    inputName: matches[7].trim(),
                    condition: matches[8].trim(),
                    inputValue: matches[9].trim()
                };
            }
        }
        return rule;
    }

    private static _getPredicateResult(rule: IPredicate, valueToCheck: string): boolean {
        let returnValue: boolean = false;

        let valueToCheckLowerCase = valueToCheck ? valueToCheck.toString().toLowerCase() : valueToCheck;

        if (rule) {
            let expectedValue = rule.inputValue ? rule.inputValue.toString().toLowerCase() : rule.inputValue;

            switch (rule.condition) {
                case "=":
                case "==":
                    returnValue = (valueToCheckLowerCase === expectedValue);
                    break;
                case "!=":
                    returnValue = (valueToCheckLowerCase !== expectedValue);
                    break;
                case "<":
                    returnValue = (valueToCheckLowerCase < expectedValue);
                    break;
                case ">":
                    returnValue = (valueToCheckLowerCase > expectedValue);
                    break;
                case "<=":
                    returnValue = (valueToCheckLowerCase <= expectedValue);
                    break;
                case ">=":
                    returnValue = (valueToCheckLowerCase >= expectedValue);
                    break;
                case "Contains":
                    returnValue = (valueToCheck && valueToCheck.indexOf(expectedValue) >= 0);
                    break;
                case "StartsWith":
                    returnValue = (valueToCheck && valueToCheck.toLowerCase().startsWith(expectedValue.toLowerCase()));
                    break;
                case "EndsWith":
                    returnValue = (valueToCheck && valueToCheck.toLowerCase().endsWith(expectedValue.toLowerCase()));
                    break;
                case "NotContains":
                    returnValue = !(valueToCheck && valueToCheck.indexOf(expectedValue) >= 0);
                    break;
                case "NotStartsWith":
                    returnValue = !(valueToCheck && valueToCheck.toLowerCase().startsWith(expectedValue.toLowerCase()));
                    break;
                case "NotEndsWith":
                    returnValue = !(valueToCheck && valueToCheck.toLowerCase().endsWith(expectedValue.toLowerCase()));
                    break;
            }
        }

        return returnValue;
    }

    private static _evaluate(expr1: boolean, expr2: boolean, operator: string): boolean {
        if (operator === Operator_AND) {
            return expr1 && expr2;
        } else if (operator === Operator_OR) {
            return expr1 || expr2;
        } else if (operator === null) {
            // Single condition, no operator
            return expr2;
        }
        return true;
    }
}