"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPClient = void 0;
const axios_1 = __importDefault(require("axios"));
const core_1 = require("@discourse/core");
class MCPClient {
    config;
    logger;
    constructor(config) {
        this.config = config;
        this.logger = (0, core_1.createLogger)(config);
    }
    async httpGet(url, maxBytes) {
        const startTime = Date.now();
        try {
            this.logger.info({ url, maxBytes }, 'Making MCP HTTP GET request');
            const response = await axios_1.default.post(`${this.config.MCP_HTTP_URL}/tools/http.get`, {
                url,
                max_bytes: maxBytes || this.config.MAX_HTTP_BYTES,
            }, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const latency = Date.now() - startTime;
            this.logger.info({ url, latency }, 'MCP HTTP GET completed');
            return response.data;
        }
        catch (error) {
            const latency = Date.now() - startTime;
            this.logger.error({ url, latency, error }, 'MCP HTTP GET failed');
            if (axios_1.default.isAxiosError(error)) {
                if (error.response?.status === 400) {
                    throw new Error(`Invalid request: ${error.response.data?.message || 'Bad request'}`);
                }
                else if (error.response?.status === 403) {
                    throw new Error(`Access denied: URL not in allowlist`);
                }
                else if (error.response && error.response.status >= 500) {
                    throw new Error(`MCP server error: ${error.response.data?.message || 'Internal server error'}`);
                }
            }
            throw new Error(`MCP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async isHealthy() {
        try {
            const response = await axios_1.default.get(`${this.config.MCP_HTTP_URL}/health`, {
                timeout: 5000,
            });
            return response.status === 200;
        }
        catch (error) {
            this.logger.warn({ error }, 'MCP health check failed');
            return false;
        }
    }
}
exports.MCPClient = MCPClient;
//# sourceMappingURL=mcp-client.js.map