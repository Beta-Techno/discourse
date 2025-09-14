import { Config } from '@discourse/core';
import { MCPClient } from './mcp-client.js';
import { McpBroker } from '../mcp/broker.js';
export declare class OpenAIService {
    private client;
    private mcpClient;
    private broker;
    private config;
    private logger;
    constructor(config: Config, mcpClient: MCPClient, broker: McpBroker);
    private getAvailableTools;
    processRequest(prompt: string, runId: string): Promise<{
        message: string;
        toolsUsed: string[];
    }>;
}
//# sourceMappingURL=openai-service.d.ts.map