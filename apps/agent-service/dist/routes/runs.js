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
    router.post('/runs', async (req, res) => {
        const runId = (0, uuid_1.v4)();
        const startTime = Date.now();
        try {
            const requestData = core_1.CreateRunRequestSchema.parse(req.body);
            const { prompt, userId, channelId, threadId } = requestData;
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
            let finalThreadId = threadId;
            let finalMessage = '';
            try {
                const result = await openaiService.processRequest(prompt, runId);
                finalMessage = result.message;
                if (!finalThreadId) {
                    const threadName = `AI Response - ${new Date().toLocaleDateString()}`;
                    finalThreadId = await discordService.createThread(channelId, threadName, finalMessage);
                }
                else {
                    await discordService.sendMessage(finalThreadId, finalMessage);
                }
                const latency = Date.now() - startTime;
                await db.update(schema_js_1.runs)
                    .set({
                    thread_id: finalThreadId,
                    tools_used: result.toolsUsed,
                    status: 'ok',
                    latency_ms: latency,
                })
                    .where((0, drizzle_orm_1.eq)(schema_js_1.runs.id, Number(runRecord.lastInsertRowid)));
                logger.info({ runId, latency, toolsUsed: result.toolsUsed }, 'Run completed successfully');
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
                if (!finalThreadId) {
                    const threadName = `AI Error - ${new Date().toLocaleDateString()}`;
                    finalThreadId = await discordService.createThread(channelId, threadName, errorResponse);
                }
                else {
                    await discordService.sendMessage(finalThreadId, errorResponse);
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