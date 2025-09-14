"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunsRouter = createRunsRouter;
const express_1 = require("express");
const uuid_1 = require("uuid");
const drizzle_orm_1 = require("drizzle-orm");
const core_1 = require("@discourse/core");
const schema_js_1 = require("../database/schema.js");
function createRunsRouter(config, db, openaiService, discordService) {
    const router = (0, express_1.Router)();
    const logger = (0, core_1.createLogger)(config);
    router.post('/', async (req, res) => {
        const runId = (0, uuid_1.v4)();
        const startTime = Date.now();
        const defaultMode = config.REPLY_MODE;
        const autoThreshold = config.AUTO_THREAD_THRESHOLD;
        try {
            const requestData = core_1.CreateRunRequestSchema.parse(req.body);
            const { prompt, userId, channelId, threadId, replyToMessageId, replyMode } = requestData;
            logger.info({ runId, userId, channelId, promptLength: prompt.length }, 'Processing run request');
            const runRecord = await db.insert(schema_js_1.runs).values({
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
                const result = await openaiService.processRequest(prompt, runId);
                finalMessage = result.message;
                const toolsUsed = result.toolsUsed ?? [];
                const mode = replyMode ?? defaultMode;
                const shouldThread = mode === 'thread' ||
                    (mode === 'auto' && (finalMessage.length > autoThreshold || toolsUsed.length > 0));
                if (shouldThread) {
                    const threadName = `AI Response - ${new Date().toLocaleDateString()}`;
                    finalThreadId = await discordService.createThread(channelId, threadName, finalMessage);
                }
                else {
                    await discordService.sendReply(channelId, replyToMessageId ?? null, finalMessage);
                    finalThreadId = channelId;
                }
                const latency = Date.now() - startTime;
                await db.update(schema_js_1.runs)
                    .set({
                    thread_id: finalThreadId,
                    tools_used: toolsUsed,
                    status: 'ok',
                    latency_ms: latency,
                })
                    .where((0, drizzle_orm_1.eq)(schema_js_1.runs.id, Number(runRecord.lastInsertRowid)));
                logger.info({ runId, latency, toolsUsed }, 'Run completed successfully');
                const response = {
                    id: runId,
                    threadId: finalThreadId,
                    message: finalMessage,
                };
                res.json(response);
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
                    .where((0, drizzle_orm_1.eq)(schema_js_1.runs.id, Number(runRecord.lastInsertRowid)));
                logger.error({ runId, latency, error: processingError }, 'Run processing failed');
                const errorResponse = `❌ I encountered an error processing your request: ${errorMessage}`;
                const mode = replyMode ?? defaultMode;
                if (mode === 'thread' || (!replyToMessageId && mode !== 'inline')) {
                    const threadName = `AI Error - ${new Date().toLocaleDateString()}`;
                    finalThreadId = await discordService.createThread(channelId, threadName, errorResponse);
                }
                else {
                    await discordService.sendReply(channelId, replyToMessageId ?? null, errorResponse);
                    finalThreadId = channelId;
                }
                const response = {
                    id: runId,
                    threadId: finalThreadId,
                    message: errorResponse,
                };
                res.status(500).json(response);
            }
        }
        catch (error) {
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
//# sourceMappingURL=runs.js.map