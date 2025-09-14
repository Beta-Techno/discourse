import { Config } from '@discourse/core';
import { MCPClient } from './mcp-client.js';
export declare class OpenAIService {
    private client;
    private mcpClient;
    private config;
    private logger;
    constructor(config: Config, mcpClient: MCPClient);
    private getAvailableTools;
    processRequest(prompt: string, runId: string): Promise<{
        message: string;
        toolsUsed: string[];
    }>;
}
//# sourceMappingURL=openai-service.d.ts.map