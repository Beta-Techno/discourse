import axios from 'axios';
import { Config, MCPHttpGet, MCPHttpResponse, createLogger } from '@discourse/core';

export class MCPClient {
  private config: Config;
  private logger: ReturnType<typeof createLogger>;

  constructor(config: Config) {
    this.config = config;
    this.logger = createLogger(config);
  }

  async httpGet(url: string, maxBytes?: number): Promise<MCPHttpResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info({ url, maxBytes }, 'Making MCP HTTP GET request');
      
      const response = await axios.post(
        `${this.config.MCP_HTTP_URL}/tools/http.get`,
        {
          url,
          max_bytes: maxBytes || this.config.MAX_HTTP_BYTES,
        },
        {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const latency = Date.now() - startTime;
      this.logger.info({ url, latency }, 'MCP HTTP GET completed');

      return response.data;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error({ url, latency, error }, 'MCP HTTP GET failed');
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400) {
          throw new Error(`Invalid request: ${error.response.data?.message || 'Bad request'}`);
        } else if (error.response?.status === 403) {
          throw new Error(`Access denied: URL not in allowlist`);
        } else if (error.response && error.response.status >= 500) {
          throw new Error(`MCP server error: ${error.response.data?.message || 'Internal server error'}`);
        }
      }
      
      throw new Error(`MCP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.config.MCP_HTTP_URL}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      this.logger.warn({ error }, 'MCP health check failed');
      return false;
    }
  }
}
