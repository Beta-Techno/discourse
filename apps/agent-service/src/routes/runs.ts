import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { createLogger, type AgentCreateRunRequest, type AgentCreateRunResponse } from '@discourse/core';
import { Database } from '../database/connection.js';
import { runs } from '../database/schema.js';
import { Config } from '@discourse/core';
import { emitRunEvent } from '../api/streams.js';
import { getProfile } from '../profiles/index.js';
import { OpenAIAdapter } from '../adapters/OpenAIAdapter.js';
import type { McpBroker } from '../mcp/broker.js';

export function createRunsRouter(
  config: Config,
  db: Database,
  mcpBroker: McpBroker
): Router {
  const router = Router();
  const logger = createLogger(config);
  
  // Simple in-memory deduplication cache
  const requestCache = new Map<string, { timestamp: number; runId: string }>();
  const DEDUP_WINDOW_MS = 5000; // 5 seconds

  router.post('/', async (req, res) => {
    const runId = uuidv4();
    const startTime = Date.now();
    
    try {
      // Validate request
      const requestData = req.body as AgentCreateRunRequest;
      const { prompt, profileId, user, context } = requestData;

      // Get profile configuration
      const profile = getProfile(profileId);
      
      // Create deduplication key (include context to prevent cross-channel conflicts)
      const dedupKey = [
        user.id,
        user.provider,
        context?.replyToMessageId ?? 'noMessage',
        context?.channelId ?? 'noChannel',
        prompt.slice(0, 100)
      ].join(':');
      const now = Date.now();
      
      // Check for duplicate request
      const existing = requestCache.get(dedupKey);
      if (existing && (now - existing.timestamp) < DEDUP_WINDOW_MS) {
        logger.info({ runId, existingRunId: existing.runId, dedupKey }, 'Duplicate request detected, returning existing run');
        return res.json({
          id: existing.runId,
          status: 'created'
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

      logger.info({ runId, userId: user.id, provider: user.provider, profileId, promptLength: prompt.length }, 'Processing run request');

      // Create run record in database
      const runRecord = await db.insert(runs).values({
        discord_id: user.id,
        channel_id: context?.channelId || null,
        thread_id: context?.threadId || null,
        prompt,
        tools_used: null,
        status: 'running',
        error: null,
        latency_ms: null,
      });

      // Return immediately with run ID - processing happens asynchronously
      const response: AgentCreateRunResponse = {
        id: runId,
        status: 'created',
        eventsUrl: `/runs/${runId}/events`
      };
      res.json(response);

      // Start async processing
      processRunAsync(runId, prompt, profile, user, context, startTime, runRecord.lastInsertRowid, dedupKey);
      return;

    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error({ runId, latency, error }, 'Run request failed');

      // Clean up deduplication cache on any error
      try {
        const requestData = req.body as AgentCreateRunRequest;
        const { user, prompt, context } = requestData;
        const dedupKey = [
          user.id,
          user.provider,
          context?.replyToMessageId ?? 'noMessage',
          context?.channelId ?? 'noChannel',
          prompt.slice(0, 100)
        ].join(':');
        requestCache.delete(dedupKey);
      } catch {
        // Ignore cleanup errors
      }

      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return;
    }
  });

  // Async processing function
  async function processRunAsync(
    runId: string,
    prompt: string,
    profile: any,
    user: any,
    context: any,
    startTime: number,
    runRecordId: any,
    dedupKey: string
  ) {
    try {
      // Emit plan event
      emitRunEvent(runId, 'plan', { 
        steps: ['Analyzing request', 'Calling tools', 'Generating response'],
        profile: profile.id 
      });

      // Create model adapter based on profile
          const modelAdapter = new OpenAIAdapter(config.OPENAI_API_KEY, mcpBroker);

      // Process with the model adapter
      const result = await modelAdapter.chat({
        messages: [
          {
            role: 'system',
            content: profile.systemPrompt || 'You are Discourse AI, a channel-agnostic company assistant. You plan, call tools via MCP, and stream intermediate results as events. Be concise, cite tools used when relevant, and respect policy/budgets.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: mcpBroker.getOpenAIFunctionTools(profile.toolAllowlist ?? ['*']),
        onEvent: (ev) => {
          emitRunEvent(runId, ev.type, ev.data);
        },
        temperature: profile.temperature,
        maxSteps: profile.maxSteps
      });

      // Update run record with success
      const latency = Date.now() - startTime;
      await db.update(runs)
        .set({
          tools_used: [], // TODO: Extract from events
          status: 'ok',
          latency_ms: latency,
        })
        .where(eq(runs.id, Number(runRecordId)));

      logger.info({ runId, latency }, 'Run completed successfully');

      // Clean up deduplication cache
      requestCache.delete(dedupKey);

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
        .where(eq(runs.id, Number(runRecordId)));

      logger.error({ runId, latency, error: processingError }, 'Run processing failed');

      // Emit error event
      emitRunEvent(runId, 'error', { message: errorMessage });

      // Clean up deduplication cache
      requestCache.delete(dedupKey);
    }
  }

  return router;
}
