import * as crypto from 'crypto';

export class Utilities {
    public static createSha256Hash(input: string): string {
        return crypto.createHash('sha256').update(input).digest('hex');
    }
}