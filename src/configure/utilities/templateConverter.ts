const templateParametersRegex = /(inputs|variables|assets|secrets)\.\w+/g;
const templateEnclosedParametersRegex = /{{{?\s*(inputs|variables|assets|secrets)\.\w+\s*}?}}/g;
const mustacheHelperRegex = /{?{{\s*#(\w+)(.*?)({?{{\s*\/\1)}}}?/;

export function convertExpression(expression: string): string {
    let match = expression.match(mustacheHelperRegex);
    if (!match) {
        return expression;
    }
    let localMustacheExpression = "";
    let openingHelperFunc = "{{";
    let closingHelperFunc = "}}";
    let parts = [];
    let helperName = "";

    if (expression.startsWith('{{{')) {
        closingHelperFunc = "}}}"
        openingHelperFunc = "{{{"
    }

    if (expression.indexOf(' ') !== -1 && expression.indexOf(' ') < expression.indexOf(closingHelperFunc)) {
        helperName = expression.substring(openingHelperFunc.length + 1, expression.indexOf(' '));
        parts.push(expression.substring(0, expression.indexOf(' ')) + closingHelperFunc);
        let part = expression.substring(expression.indexOf(' '), expression.indexOf(closingHelperFunc)).trim();
        let inputs = part.match(templateParametersRegex) || [];
        for (let input of inputs) {
            part = part.replace(input, "{{{" + input + "}}}")
        }
        parts.push(part);
    }
    else {
        helperName = expression.substring(openingHelperFunc.length + 1, expression.indexOf(closingHelperFunc));
        parts.push(expression.substring(0, expression.indexOf(closingHelperFunc) + closingHelperFunc.length));
    }

    if (expression.substr(expression.indexOf(closingHelperFunc) + closingHelperFunc.length, openingHelperFunc.length + 1 + helperName.length) === openingHelperFunc + '/' + helperName) {
        parts.push(expression.substring(expression.indexOf(closingHelperFunc) + closingHelperFunc.length));
    }
    else {
        let part = expression.substring(expression.indexOf(closingHelperFunc) + closingHelperFunc.length, expression.indexOf(openingHelperFunc + '/' + helperName));
        part = convertStringMustachExpression(part);
        parts.push(part);
        parts.push(expression.substring(expression.indexOf(openingHelperFunc + '/' + helperName)));
    }

    if (parts.length === 4) {
        localMustacheExpression = parts[0] + parts[1] + ' ' + parts[2] + parts[3];
    }
    else {
        localMustacheExpression = parts.join('');
    }
    return localMustacheExpression

}

function replaceAtIndex(text: string, searchValue: string, replaceValue: string, index: number) {
    if (text.indexOf(searchValue, index) !== -1) {
        let preStr = text.substr(0, index);
        let postStr = text.substr(index + searchValue.length);
        text = preStr + replaceValue + postStr;
    }
    return text;
}

export function convertStringMustachExpression(text: string): string {
    text = sanitizeExpression(text);
    let helperRegExp = /{?{{\s*#(\w+)(.*?)({?{{\s*\/\1)}}}?/g;
    let result = helperRegExp.exec(text);
    while (result) {
        let exp = convertExpression(result[0]);
        text = replaceAtIndex(text, result[0], exp, result.index);
        result = helperRegExp.exec(text);
    }
    return text;
}

export function sanitizeExpression(text: string): string {
    let result = templateEnclosedParametersRegex.exec(text);
    while (result) {
        if (!result[0].startsWith('{{{')) {
            text = replaceAtIndex(text, result[0], '{' + result[0] + '}', result.index);
        }
        result = templateEnclosedParametersRegex.exec(text);
    }
    return text;
}

export function convertObjectMustacheExpression(object: any): any {
    if (typeof object === "string") {
        return convertStringMustachExpression(object);
    }

    if (Array.isArray(object)) {
        for (let i = 0; i < object.length; i++) {
            object[i] = convertObjectMustacheExpression(object[i]);
        }
    }

    Object.keys(object).forEach(key => {
        if (!!key && !!object[key]) {
            object[key] = convertObjectMustacheExpression(object[key]);
        }
    });

    return object;
}