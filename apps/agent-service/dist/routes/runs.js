"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunsRouter = createRunsRouter;
const express_1 = require("express");
const uuid_1 = require("uuid");
const drizzle_orm_1 = require("drizzle-orm");
const core_1 = require("@discourse/core");
const schema_js_1 = require("../database/schema.js");
const streams_js_1 = require("../api/streams.js");
const index_js_1 = require("../profiles/index.js");
const OpenAIAdapter_js_1 = require("../adapters/OpenAIAdapter.js");
function createRunsRouter(config, db, mcpBroker) {
    const router = (0, express_1.Router)();
    const logger = (0, core_1.createLogger)(config);
    const requestCache = new Map();
    const DEDUP_WINDOW_MS = 5000;
    router.post('/', async (req, res) => {
        const runId = (0, uuid_1.v4)();
        const startTime = Date.now();
        try {
            const requestData = req.body;
            const { prompt, profileId, user, context } = requestData;
            const profile = (0, index_js_1.getProfile)(profileId);
            const dedupKey = [
                user.id,
                user.provider,
                context?.replyToMessageId ?? 'noMessage',
                context?.channelId ?? 'noChannel',
                prompt.slice(0, 100)
            ].join(':');
            const now = Date.now();
            const existing = requestCache.get(dedupKey);
            if (existing && (now - existing.timestamp) < DEDUP_WINDOW_MS) {
                logger.info({ runId, existingRunId: existing.runId, dedupKey }, 'Duplicate request detected, returning existing run');
                return res.json({
                    id: existing.runId,
                    status: 'created'
                });
            }
            requestCache.set(dedupKey, { timestamp: now, runId });
            for (const [key, value] of requestCache.entries()) {
                if (now - value.timestamp > DEDUP_WINDOW_MS * 2) {
                    requestCache.delete(key);
                }
            }
            logger.info({ runId, userId: user.id, provider: user.provider, profileId, promptLength: prompt.length }, 'Processing run request');
            const runRecord = await db.insert(schema_js_1.runs).values({
                discord_id: user.id,
                channel_id: context?.channelId || null,
                thread_id: context?.threadId || null,
                prompt,
                tools_used: null,
                status: 'running',
                error: null,
                latency_ms: null,
            });
            const response = {
                id: runId,
                status: 'created',
                eventsUrl: `/runs/${runId}/events`
            };
            res.json(response);
            processRunAsync(runId, prompt, profile, user, context, startTime, runRecord.lastInsertRowid, dedupKey);
            return;
        }
        catch (error) {
            const latency = Date.now() - startTime;
            logger.error({ runId, latency, error }, 'Run request failed');
            try {
                const requestData = req.body;
                const { user, prompt, context } = requestData;
                const dedupKey = [
                    user.id,
                    user.provider,
                    context?.replyToMessageId ?? 'noMessage',
                    context?.channelId ?? 'noChannel',
                    prompt.slice(0, 100)
                ].join(':');
                requestCache.delete(dedupKey);
            }
            catch {
            }
            res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
            return;
        }
    });
    async function processRunAsync(runId, prompt, profile, user, context, startTime, runRecordId, dedupKey) {
        try {
            (0, streams_js_1.emitRunEvent)(runId, 'plan', {
                steps: ['Analyzing request', 'Calling tools', 'Generating response'],
                profile: profile.id
            });
            const modelAdapter = new OpenAIAdapter_js_1.OpenAIAdapter(config.OPENAI_API_KEY, mcpBroker);
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
                    (0, streams_js_1.emitRunEvent)(runId, ev.type, ev.data);
                },
                temperature: profile.temperature,
                maxSteps: profile.maxSteps
            });
            const latency = Date.now() - startTime;
            await db.update(schema_js_1.runs)
                .set({
                tools_used: [],
                status: 'ok',
                latency_ms: latency,
            })
                .where((0, drizzle_orm_1.eq)(schema_js_1.runs.id, Number(runRecordId)));
            logger.info({ runId, latency }, 'Run completed successfully');
            requestCache.delete(dedupKey);
        }
        catch (processingError) {
            const latency = Date.now() - startTime;
            const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error';
            await db.update(schema_js_1.runs)
                .set({
                status: 'error',
                error: errorMessage,
                latency_ms: latency,
            })
                .where((0, drizzle_orm_1.eq)(schema_js_1.runs.id, Number(runRecordId)));
            logger.error({ runId, latency, error: processingError }, 'Run processing failed');
            (0, streams_js_1.emitRunEvent)(runId, 'error', { message: errorMessage });
            requestCache.delete(dedupKey);
        }
    }
    return router;
}
//# sourceMappingURL=runs.js.map