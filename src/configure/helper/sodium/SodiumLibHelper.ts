import * as sodium from 'tweetsodium';

export class SodiumLibHelper {
    key: Uint8Array;

    constructor(key: Uint8Array | string) {
        if(typeof(key) == "string") {
            let decodedKey = this.decodeFromBase64(key);
            this.key = this.convertStringToUint8Array(decodedKey);
        } else {
            this.key = key;
        }
    }

    encrypt = (message: Uint8Array|string) => {
        if(typeof(message) == "string") {
            return sodium.seal(this.convertStringToUint8Array(message), this.key)
        } else {
            return sodium.seal(message, this.key)
        }
    }
    
    decodeFromBase64 = (encoded : string) : string => {
        let decodedbase64 = new Buffer(encoded, 'base64');
        return decodedbase64.toString('binary')
    }
  
    encodeToBase64 = (decoded : string) : string => {
        return (new Buffer(decoded)).toString('base64')
    }

    convertStringToUint8Array = (v: string) : Uint8Array => {
        let body = v.split('')
        let _body = body.map((a) => {
            return a.charCodeAt(0);
        })
        return Uint8Array.from(_body)
    }

    convertUint8ArrayToString = (v: Uint8Array): string => {
        return Buffer.from(v).toString();
    }
}

