import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { ConfigSchema, createLogger } from '@discourse/core';
import { createDatabaseConnection } from './database/connection.js';
import { createRunsRouter } from './routes/runs.js';
import { McpBroker } from './mcp/broker.js';
import { streamRun } from './api/streams.js';

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
    const broker = new McpBroker(config_);
    await broker.start();

    // MCP broker is already started above

    // Create Express app
    const app = express();
    const port = Number(process.env.PORT ?? 8080);

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
        
        res.json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          services: {
            database: 'healthy',
            mcp: 'healthy',
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
    app.use('/runs', createRunsRouter(config_, db, broker));
    
    // SSE streaming endpoint
    app.get('/runs/:id/events', streamRun);

    // MCP introspection (non-auth, dev only)
    app.get('/mcp/tools', (req, res) => {
      res.json({ tools: broker.listFQNs() });
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

    // Start server with SSE-friendly timeouts
    const server = app.listen(port, () => {
      logger.info({ port }, 'Agent service started successfully');
    });
    // Never time out active requests (SSE stays open)
    (server as any).requestTimeout = 0;
    // Generous header & keep-alive windows (not strictly required, but helpful)
    (server as any).headersTimeout = 120_000;
    (server as any).keepAliveTimeout = 75_000;

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
