export class StaticValidator {
    static validateNumberValue(currentValue: string, minValue: number, maxValue: number): any {
        throw new Error("Method not implemented.");
    }
    static validateRegex(currentValue: string, regexPattern: string, arg2: string): any {
        throw new Error("Method not implemented.");
    }
    static validateLength(currentValue: string, minLength: number, maxLength: number): any {
        throw new Error("Method not implemented.");
    }
    public static validateRequired(value: string): any {
        if (!value) {
            return { valid: false, message: "required" };
        }

        return { valid: true, message: "" };
    }
}