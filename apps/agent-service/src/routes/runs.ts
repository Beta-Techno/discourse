import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { CreateRunRequestSchema, CreateRunResponse, createLogger } from '@discourse/core';
import { Database } from '../database/connection.js';
import { runs } from '../database/schema.js';
import { OpenAIService } from '../services/openai-service.js';
import { MCPClient } from '../services/mcp-client.js';
import { DiscordService } from '../services/discord-service.js';
import { Config } from '@discourse/core';

export function createRunsRouter(
  config: Config,
  db: Database,
  openaiService: OpenAIService,
  discordService: DiscordService
): Router {
  const router = Router();
  const logger = createLogger(config);

  router.post('/', async (req, res) => {
    const runId = uuidv4();
    const startTime = Date.now();
    
    try {
      // Validate request
      const requestData = CreateRunRequestSchema.parse(req.body);
      const { prompt, userId, channelId, threadId } = requestData;

      logger.info({ runId, userId, channelId, promptLength: prompt.length }, 'Processing run request');

      // Create run record in database
      const runRecord = await db.insert(runs).values({
        discord_id: userId,
        channel_id: channelId,
        thread_id: threadId || null,
        prompt,
        tools_used: null,
        status: 'running',
        error: null,
        latency_ms: null,
      });

      let finalThreadId = threadId;
      let finalMessage = '';

      try {
        // Process with OpenAI
        const result = await openaiService.processRequest(prompt, runId);
        finalMessage = result.message;

        // Create thread if not provided
        if (!finalThreadId) {
          const threadName = `AI Response - ${new Date().toLocaleDateString()}`;
          finalThreadId = await discordService.createThread(channelId, threadName, finalMessage);
        } else {
          // Send message to existing thread
          await discordService.sendMessage(finalThreadId, finalMessage);
        }

        // Update run record with success
        const latency = Date.now() - startTime;
        await db.update(runs)
          .set({
            thread_id: finalThreadId,
            tools_used: result.toolsUsed,
            status: 'ok',
            latency_ms: latency,
          })
          .where(eq(runs.id, Number(runRecord.lastInsertRowid)));

        logger.info({ runId, latency, toolsUsed: result.toolsUsed }, 'Run completed successfully');

        const response: CreateRunResponse = {
          id: runId,
          threadId: finalThreadId,
          message: finalMessage,
        };

        res.json(response);

      } catch (processingError) {
        // Update run record with error
        const latency = Date.now() - startTime;
        const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error';
        
        await db.update(runs)
          .set({
            status: 'error',
            error: errorMessage,
            latency_ms: latency,
          })
          .where(eq(runs.id, Number(runRecord.lastInsertRowid)));

        logger.error({ runId, latency, error: processingError }, 'Run processing failed');

        // Send error message to Discord
        const errorResponse = `❌ I encountered an error processing your request: ${errorMessage}`;
        
        if (!finalThreadId) {
          const threadName = `AI Error - ${new Date().toLocaleDateString()}`;
          finalThreadId = await discordService.createThread(channelId, threadName, errorResponse);
        } else {
          await discordService.sendMessage(finalThreadId, errorResponse);
        }

        const response: CreateRunResponse = {
          id: runId,
          threadId: finalThreadId,
          message: errorResponse,
        };

        res.status(500).json(response);
      }

    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error({ runId, latency, error }, 'Run request failed');

      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({
          error: 'Invalid request data',
          details: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
