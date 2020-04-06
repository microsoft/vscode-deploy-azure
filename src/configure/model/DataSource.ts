export interface DataSource {
    
    Id: string;
    EndpointUrlStem: string;
    HttpMethod: string;
    RequestBody: string;
    ResultSelector: string;
    ResultTemplate: string;
}