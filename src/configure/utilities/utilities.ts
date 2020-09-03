import * as crypto from 'crypto';

export class Utilities {
    public static createSha256Hash(input: string): string {
        return crypto.createHash('sha256').update(input).digest('hex');
    }
}

export class WhiteListedError extends Error {
    constructor(message?: string, error?: any) {
        super(message || error.message);
        if (error) {
            const errorClone = JSON.parse(JSON.stringify(error));
            for (var attribute in errorClone) {
                this[attribute] = errorClone[attribute];
            }
            this.message = message || this.message;
            this.stack = error.stack || "";
        }
    }
}