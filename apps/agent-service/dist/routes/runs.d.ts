import { Router } from 'express';
import { Database } from '../database/connection.js';
import { Config } from '@discourse/core';
import type { McpBroker } from '../mcp/broker.js';
export declare function createRunsRouter(config: Config, db: Database, mcpBroker: McpBroker): Router;
//# sourceMappingURL=runs.d.ts.map