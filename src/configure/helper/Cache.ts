import { ICache } from "./ICache";

export class Cache implements ICache {
    public static getCache(): ICache {
        if (!this.cache) {
            this.cache = new Cache();
        }
        return this.cache;
    }

    private static cache: Cache;
    private store: Map<string, any>;

    constructor() {
        this.store = new Map<string, any>();
    }

    public getValue(key: string): any {
        key = this.sanitizeKey(key);
        if (this.store.has(key)) {
            return this.store.get(key);
        }
        return null;
    }

    public clearCache() {
        this.store = new Map<string, any>();
    }

    public put(key: string, value: any): void {
        key = this.sanitizeKey(key);
        this.store.set(key, value);
    }

    private sanitizeKey(key: string): string {
        const apiVersionIndex = key.indexOf('?api-version=');
        if (apiVersionIndex >= 0 && !(key.indexOf('&') > apiVersionIndex)) {
            key = key.substring(0, key.indexOf('?api-version='));
        }
        return key;
    }
}
