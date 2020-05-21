import * as utils from 'util';
import { Messages } from "../../../resources/messages";

export class StaticValidator {
    public static validateRequired(value: string): any {
        if (!value) {
            return Messages.valueRequired;
        }
        return "";
    }

    public static validateLength(value: string, minLength: number, maxLength: number): any {
        if (minLength && minLength > 0 && value.length < minLength) {
            return utils.format(Messages.minLengthMessage, minLength);
        }
        else if (maxLength && maxLength > 0 && value.length > maxLength) {
            return utils.format(Messages.maxLengthMessage, maxLength);
        }
        return "";
    }

    public static validateNumberValue(value: any, minValue: number, maxValue: number): any {
        if (!isNaN(Number(value.toString()))) {
            var intValue = parseInt(value);
            if (minValue && intValue < minValue) {
                return utils.format(Messages.minValueMessage, minValue);
            }
            else if (maxValue && intValue > maxValue) {
                return utils.format(Messages.maxValueMessage, maxValue);
            }
        }
        else {
            return utils.format(Messages.valueShouldBeNumber, value.toString());
        }
        return "";
    }

    public static validateRegex(value: string, pattern: string, regexFlags: string = ""): any {
        var regex = new RegExp(pattern, regexFlags);
        if (!regex.test(value)) {
            return utils.format(Messages.regexPatternNotMatchingMessage, pattern);
        }
        return "";
    }
}