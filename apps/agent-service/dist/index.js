"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = require("dotenv");
const drizzle_orm_1 = require("drizzle-orm");
const core_1 = require("@discourse/core");
const connection_js_1 = require("./database/connection.js");
const runs_js_1 = require("./routes/runs.js");
const openai_service_js_1 = require("./services/openai-service.js");
const mcp_client_js_1 = require("./services/mcp-client.js");
const discord_service_js_1 = require("./services/discord-service.js");
const broker_js_1 = require("./mcp/broker.js");
(0, dotenv_1.config)({ path: '../../.env' });
const config_ = core_1.ConfigSchema.parse(process.env);
const logger = (0, core_1.createLogger)(config_);
async function startServer() {
    try {
        logger.info('Connecting to database...');
        const db = (0, connection_js_1.createDatabaseConnection)(config_);
        await db.run((0, drizzle_orm_1.sql) `SELECT 1`);
        logger.info('Database connected successfully');
        const mcpClient = new mcp_client_js_1.MCPClient(config_);
        const broker = new broker_js_1.McpBroker(config_);
        await broker.start();
        const openaiService = new openai_service_js_1.OpenAIService(config_, mcpClient, broker);
        const discordService = new discord_service_js_1.DiscordService(config_);
        const mcpHealthy = await mcpClient.isHealthy();
        if (!mcpHealthy) {
            logger.warn('MCP service is not healthy, continuing without tools');
        }
        else {
            logger.info('MCP service is healthy');
        }
        const app = (0, express_1.default)();
        const port = process.env.PORT || 8081;
        app.use((0, helmet_1.default)());
        app.use((0, cors_1.default)());
        app.use(express_1.default.json({ limit: '10mb' }));
        app.use(express_1.default.urlencoded({ extended: true }));
        app.get('/healthz', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });
        app.get('/readyz', async (req, res) => {
            try {
                await db.run((0, drizzle_orm_1.sql) `SELECT 1`);
                const mcpHealthy = await mcpClient.isHealthy();
                res.json({
                    status: 'ready',
                    timestamp: new Date().toISOString(),
                    services: {
                        database: 'healthy',
                        mcp: mcpHealthy ? 'healthy' : 'unhealthy',
                    },
                });
            }
            catch (error) {
                logger.error({ error }, 'Readiness check failed');
                res.status(503).json({
                    status: 'not ready',
                    timestamp: new Date().toISOString(),
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
        app.use('/runs', (0, runs_js_1.createRunsRouter)(config_, db, openaiService, discordService));
        app.get('/mcp/tools', (req, res) => {
            res.json({ tools: broker.listFQNs() });
        });
        app.use((error, req, res, next) => {
            logger.error({ error, path: req.path, method: req.method }, 'Unhandled error');
            res.status(500).json({
                error: 'Internal server error',
                message: config_.NODE_ENV === 'development' ? error.message : 'Something went wrong',
            });
        });
        app.use((req, res) => {
            res.status(404).json({ error: 'Not found' });
        });
        app.listen(port, () => {
            logger.info({ port }, 'Agent service started successfully');
        });
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received, shutting down gracefully');
            process.exit(0);
        });
        process.on('SIGINT', () => {
            logger.info('SIGINT received, shutting down gracefully');
            process.exit(0);
        });
    }
    catch (error) {
        logger.error({ error }, 'Failed to start server');
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=index.js.map