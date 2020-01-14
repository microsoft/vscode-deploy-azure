import * as sodium from 'tweetsodium';

export class SodiumLibHelper {
    key: Uint8Array;

    constructor(key: Uint8Array | string) {
        if(typeof(key) == "string") {
            this.key = this.convertStringToUint8Array(key)
        } else {
            this.key = key;
        }
    }
    
    decode = (encoded : string) : Uint8Array => {
        return Uint8Array.from(this.convertStringToUint8Array(encoded))
    }
  
    encode = (bytes : Uint8Array) : string => {
        return Buffer.from(bytes).toString('base64')
    }

    encrypt = (message: Uint8Array|string) => {
        if(typeof(message) == "string") {
            return sodium.seal(this.convertStringToUint8Array(message), this.key)
        } else {
            return sodium.seal(message, this.key)
        }
    }

    convertStringToUint8Array = (v: string) => {
        let body = v.split('')
        .map((a) => {
            return a.charCodeAt(0);
        })
        let uintBody = Uint8Array.from(body)
        return uintBody;
    }
}