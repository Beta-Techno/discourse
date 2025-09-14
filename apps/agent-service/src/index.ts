import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { ConfigSchema, createLogger } from '@discourse/core';
import { createDatabaseConnection } from './database/connection.js';
import { createRunsRouter } from './routes/runs.js';
import { OpenAIService } from './services/openai-service.js';
import { MCPClient } from './services/mcp-client.js';
import { DiscordService } from './services/discord-service.js';

// Load environment variables from project root
config({ path: '../../.env' });

const config_ = ConfigSchema.parse(process.env);
const logger = createLogger(config_);

async function startServer() {
  try {
    // Initialize database
    logger.info('Connecting to database...');
    const db = createDatabaseConnection(config_);
    
    // Test database connection
    await db.run(sql`SELECT 1`);
    logger.info('Database connected successfully');

    // Initialize services
    const mcpClient = new MCPClient(config_);
    const openaiService = new OpenAIService(config_, mcpClient);
    const discordService = new DiscordService(config_);

    // Check MCP service health
    const mcpHealthy = await mcpClient.isHealthy();
    if (!mcpHealthy) {
      logger.warn('MCP service is not healthy, continuing without tools');
    } else {
      logger.info('MCP service is healthy');
    }

    // Create Express app
    const app = express();
    const port = process.env.PORT || 8081;

    // Middleware
    app.use(helmet());
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Health check endpoints
    app.get('/healthz', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    app.get('/readyz', async (req, res) => {
      try {
        // Check database connection
        await db.run(sql`SELECT 1`);
        
        // Check MCP service
        const mcpHealthy = await mcpClient.isHealthy();
        
        res.json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          services: {
            database: 'healthy',
            mcp: mcpHealthy ? 'healthy' : 'unhealthy',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Readiness check failed');
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // API routes
    app.use('/runs', createRunsRouter(config_, db, openaiService, discordService));

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
      logger.info({ port }, 'Agent service started successfully');
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

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
