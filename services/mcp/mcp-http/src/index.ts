import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import axios from 'axios';
import { config } from 'dotenv';
import { ConfigSchema, MCPHttpGetSchema, MCPHttpResponse, createLogger } from '@discourse/core';

// Load environment variables from project root
config({ path: '../../../.env' });

const config_ = ConfigSchema.parse(process.env);
const logger = createLogger(config_);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Parse allowed hosts
const allowedHosts = config_.ALLOWED_HOSTS.split(',').map(host => host.trim());

function isUrlAllowed(url: string): boolean {
  try {
    const urlObj = new URL(url);
    
    // Allow all domains if ALLOWED_HOSTS contains "*" or is empty
    if (allowedHosts.includes('*') || allowedHosts.length === 0 || allowedHosts[0] === '') {
      return true;
    }
    
    return allowedHosts.some(host => 
      urlObj.hostname === host || 
      urlObj.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    allowedHosts,
  });
});

// MCP HTTP GET tool endpoint
app.post('/tools/http.get', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Validate request
    const requestData = MCPHttpGetSchema.parse(req.body);
    const { url, max_bytes } = requestData;

    logger.info({ url, max_bytes }, 'Processing HTTP GET request');

    // Check if URL is allowed
    if (!isUrlAllowed(url)) {
      logger.warn({ url, allowedHosts }, 'URL not in allowlist');
      res.status(403).json({
        error: 'URL not allowed',
        message: `URL must be from one of these domains: ${allowedHosts.join(', ')}`,
        url,
      });
      return;
    }

    // Make HTTP request
    const response = await axios.get(url, {
      timeout: 10000, // 10 second timeout
      maxRedirects: 3,
      maxContentLength: 100000, // 100KB limit (increased from 10KB)
      headers: {
        'User-Agent': 'Discourse-AI/1.0 (Safe Web Browser)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      responseType: 'text',
    });

    // Extract content
    let bodySnippet = '';
    const contentType = response.headers['content-type'] || 'unknown';
    
    if (contentType.includes('text/')) {
      bodySnippet = response.data.substring(0, max_bytes);
    } else {
      bodySnippet = `[Binary content - ${contentType}]`;
    }

    const result: MCPHttpResponse = {
      url,
      status: response.status,
      content_type: contentType,
      body_snippet: bodySnippet,
    };

    const latency = Date.now() - startTime;
    logger.info({ url, status: response.status, latency }, 'HTTP GET completed successfully');

    res.json(result);

  } catch (error) {
    const latency = Date.now() - startTime;
    logger.error({ url: req.body?.url, latency, error }, 'HTTP GET failed');

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        res.status(408).json({
          error: 'Request timeout',
          message: 'The request took too long to complete',
        });
        return;
      } else if (error.response) {
        // Server responded with error status
        const result: MCPHttpResponse = {
          url: req.body?.url || 'unknown',
          status: error.response.status,
          content_type: error.response.headers['content-type'] || 'unknown',
          body_snippet: `Error ${error.response.status}: ${error.response.statusText}`,
        };
        res.json(result);
        return;
      } else if (error.request) {
        res.status(503).json({
          error: 'Network error',
          message: 'Unable to reach the requested URL',
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ error, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: config_.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(port, () => {
  logger.info({ port, allowedHosts }, 'MCP HTTP server started successfully');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
