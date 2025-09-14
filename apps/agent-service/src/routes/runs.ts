import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { CreateRunRequestSchema, CreateRunResponse, createLogger } from '@discourse/core';
import { Database } from '../database/connection.js';
import { runs } from '../database/schema.js';
import { OpenAIService } from '../services/openai-service.js';
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
  
  // Simple in-memory deduplication cache
  const requestCache = new Map<string, { timestamp: number; runId: string }>();
  const DEDUP_WINDOW_MS = 5000; // 5 seconds

  router.post('/', async (req, res) => {
    const runId = uuidv4();
    const startTime = Date.now();
    const defaultMode = config.REPLY_MODE; // 'inline' | 'thread' | 'auto'
    const autoThreshold = config.AUTO_THREAD_THRESHOLD;
    
    try {
      // Validate request
      const requestData = CreateRunRequestSchema.parse(req.body);
      const { prompt, userId, channelId, threadId, replyToMessageId, replyMode } = requestData;

      // Create deduplication key
      const dedupKey = `${userId}:${channelId}:${replyToMessageId || 'none'}:${prompt.slice(0, 100)}`;
      const now = Date.now();
      
      // Check for duplicate request
      const existing = requestCache.get(dedupKey);
      if (existing && (now - existing.timestamp) < DEDUP_WINDOW_MS) {
        logger.info({ runId, existingRunId: existing.runId, dedupKey }, 'Duplicate request detected, returning existing run');
        return res.json({
          id: existing.runId,
          threadId: channelId, // Return channel ID for compatibility
          message: 'Request already being processed'
        });
      }
      
      // Store this request in cache
      requestCache.set(dedupKey, { timestamp: now, runId });
      
      // Clean up old entries (simple cleanup)
      for (const [key, value] of requestCache.entries()) {
        if (now - value.timestamp > DEDUP_WINDOW_MS * 2) {
          requestCache.delete(key);
        }
      }

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

      let finalThreadId = threadId ?? null;
      let finalMessage = '';

      try {
        // Process with OpenAI
        const result = await openaiService.processRequest(prompt, runId);
        finalMessage = result.message;
        const toolsUsed = result.toolsUsed ?? [];

        // Decide how to deliver (inline vs thread)
        const mode = replyMode ?? defaultMode;
        const shouldThread =
          mode === 'thread' ||
          (mode === 'auto' && (finalMessage.length > autoThreshold || toolsUsed.length > 0));

        if (shouldThread) {
          const threadName = `AI Response - ${new Date().toLocaleDateString()}`;
          finalThreadId = await discordService.createThread(channelId, threadName, finalMessage);
        } else {
          await discordService.sendReply(channelId, replyToMessageId ?? null, finalMessage);
          // For compatibility with existing bot UI, return base channel id
          finalThreadId = channelId;
        }

        // Update run record with success
        const latency = Date.now() - startTime;
        await db.update(runs)
          .set({
            thread_id: finalThreadId,
            tools_used: toolsUsed,
            status: 'ok',
            latency_ms: latency,
          })
          .where(eq(runs.id, Number(runRecord.lastInsertRowid)));

        logger.info({ runId, latency, toolsUsed }, 'Run completed successfully');

        // Clean up deduplication cache
        requestCache.delete(dedupKey);

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

        // Clean up deduplication cache
        requestCache.delete(dedupKey);

        // Send error message to Discord
        const errorResponse = `❌ I encountered an error processing your request: ${errorMessage}`;
        const mode = replyMode ?? defaultMode;
        if (mode === 'thread' || (!replyToMessageId && mode !== 'inline')) {
          const threadName = `AI Error - ${new Date().toLocaleDateString()}`;
          finalThreadId = await discordService.createThread(channelId, threadName, errorResponse);
        } else {
          await discordService.sendReply(channelId, replyToMessageId ?? null, errorResponse);
          finalThreadId = channelId;
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

      // Clean up deduplication cache on any error
      try {
        const requestData = CreateRunRequestSchema.parse(req.body);
        const { userId, channelId, replyToMessageId, prompt } = requestData;
        const dedupKey = `${userId}:${channelId}:${replyToMessageId || 'none'}:${prompt.slice(0, 100)}`;
        requestCache.delete(dedupKey);
      } catch {
        // Ignore cleanup errors
      }

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
