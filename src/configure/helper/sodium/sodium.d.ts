declare module "tweetsodium" {
    export function seal(messageBytes: Uint8Array, keyBytes: Uint8Array) : any
}