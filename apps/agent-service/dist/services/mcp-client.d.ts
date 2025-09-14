import { Config, MCPHttpResponse } from '@discourse/core';
export declare class MCPClient {
    private config;
    private logger;
    constructor(config: Config);
    httpGet(url: string, maxBytes?: number): Promise<MCPHttpResponse>;
    isHealthy(): Promise<boolean>;
}
//# sourceMappingURL=mcp-client.d.ts.map