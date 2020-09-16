import * as crypto from 'crypto';
import uuid = require('uuid/v4');

export class Utilities {
    public static createSha256Hash(input: string): string {
        return crypto.createHash('sha256').update(input).digest('hex');
    }

    public static shortGuid(len: number = 5): string {
        return uuid().substr(0, len)
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