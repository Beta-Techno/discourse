import { Router } from 'express';
import { Database } from '../database/connection.js';
import { OpenAIService } from '../services/openai-service.js';
import { DiscordService } from '../services/discord-service.js';
import { Config } from '@discourse/core';
export declare function createRunsRouter(config: Config, db: Database, openaiService: OpenAIService, discordService: DiscordService): Router;
//# sourceMappingURL=runs.d.ts.map