import * as sodium from 'tweetsodium';

export class SodiumLibHelper {
    key: Uint8Array;

    constructor(key: Uint8Array | string) {
        if (typeof (key) == "string") {
            let decodedKey = SodiumLibHelper.decodeFromBase64(key);
            this.key = SodiumLibHelper.convertStringToUint8Array(decodedKey);
        } else {
            this.key = key;
        }
    }

    public encrypt (message: Uint8Array | string) {
        if (typeof (message) == "string") {
            return sodium.seal(SodiumLibHelper.convertStringToUint8Array(message), this.key)
        } else {
            return sodium.seal(message, this.key)
        }
    }

    public static decodeFromBase64(encoded: string): string {
        let decodedbase64 = new Buffer(encoded, 'base64');
        return decodedbase64.toString('binary')
    }

    public static encodeToBase64 (decoded: string): string {
        return (new Buffer(decoded, 'binary')).toString('base64')
    }

    public static convertStringToUint8Array (v: string): Uint8Array {
        let body = v.split('')
        let _body = body.map((a) => {
            return a.charCodeAt(0);
        })
        return Uint8Array.from(_body)
    }

    public static convertUint8ArrayToString (bytes: Uint8Array): string {
        return String.fromCharCode.apply(null, Array.from(bytes))
    }
}

