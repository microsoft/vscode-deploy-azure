import * as sodium from 'tweetsodium';

export class SodiumLibHelper {
    key: Uint8Array;

    constructor(key: Uint8Array | string) {
        if(typeof(key) == "string") {
            this.key = this.decode(key);
        } else {
            this.key = key;
        }
    }
    
    decode = (encoded : string) : Uint8Array => {
        let decodedbase64 = new Buffer(encoded, 'base64');
        return this.convertStringToUint8Array(decodedbase64.toString('utf-8'))
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
        let _body = body.map((a) => {
            return a.charCodeAt(0);
        })
        let uintBody = Uint8Array.from(_body)
        return uintBody;
    }
}