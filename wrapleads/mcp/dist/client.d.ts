/**
 * WrapOS REST API client for MCP server.
 * Handles auth (JWT), base URL, and typed request/response helpers.
 */
export interface WrapOSConfig {
    baseUrl: string;
    token: string;
}
export declare class WrapOSClient {
    private baseUrl;
    private token;
    constructor(config: WrapOSConfig);
    private request;
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
    put<T>(path: string, body?: unknown): Promise<T>;
    patch<T>(path: string, body?: unknown): Promise<T>;
    delete<T>(path: string): Promise<T>;
}
/** Build client from environment variables */
export declare function clientFromEnv(): WrapOSClient;
