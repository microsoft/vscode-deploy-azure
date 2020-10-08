export interface ICache {
    getValue(key: string): any;
    put(key: string, value: any): void;
    clearCache(): void;
}
