"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = exports.OpenAIFunctionToolSchema = exports.MCPHttpResponseSchema = exports.MCPHttpGetSchema = exports.MCPToolCallSchema = exports.CreateRunResponseSchema = exports.CreateRunRequestSchema = exports.RunSchema = exports.UserSchema = void 0;
const zod_1 = require("zod");
exports.UserSchema = zod_1.z.object({
    discord_id: zod_1.z.string().max(32),
    email: zod_1.z.string().email().nullable(),
    created_at: zod_1.z.date().default(() => new Date()),
});
exports.RunSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive().optional(),
    discord_id: zod_1.z.string().max(32),
    channel_id: zod_1.z.string().max(32),
    thread_id: zod_1.z.string().max(32).nullable(),
    prompt: zod_1.z.string(),
    tools_used: zod_1.z.array(zod_1.z.string()).nullable(),
    status: zod_1.z.enum(['running', 'ok', 'blocked', 'error']),
    error: zod_1.z.string().nullable(),
    latency_ms: zod_1.z.number().int().nullable(),
    created_at: zod_1.z.date().default(() => new Date()),
});
exports.CreateRunRequestSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1).max(2000),
    userId: zod_1.z.string().max(32),
    channelId: zod_1.z.string().max(32),
    threadId: zod_1.z.string().max(32).optional(),
    replyToMessageId: zod_1.z.string().max(32).optional(),
    replyMode: zod_1.z.enum(['inline', 'thread', 'auto']).optional(),
});
exports.CreateRunResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    threadId: zod_1.z.string(),
    message: zod_1.z.string(),
});
exports.MCPToolCallSchema = zod_1.z.object({
    name: zod_1.z.string(),
    arguments: zod_1.z.record(zod_1.z.unknown()),
});
exports.MCPHttpGetSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    max_bytes: zod_1.z.number().int().positive().optional().default(100000),
});
exports.MCPHttpResponseSchema = zod_1.z.object({
    url: zod_1.z.string(),
    status: zod_1.z.number().int(),
    content_type: zod_1.z.string().nullable(),
    body_snippet: zod_1.z.string(),
});
exports.OpenAIFunctionToolSchema = zod_1.z.object({
    type: zod_1.z.literal('function'),
    function: zod_1.z.object({
        name: zod_1.z.string(),
        description: zod_1.z.string(),
        parameters: zod_1.z.object({
            type: zod_1.z.literal('object'),
            properties: zod_1.z.record(zod_1.z.object({
                type: zod_1.z.string(),
                description: zod_1.z.string().optional(),
            })),
            required: zod_1.z.array(zod_1.z.string()).optional(),
        }),
    }),
});
exports.ConfigSchema = zod_1.z.object({
    DISCORD_TOKEN: zod_1.z.string().min(1),
    DISCORD_APP_ID: zod_1.z.string().min(1),
    GUILD_ID: zod_1.z.string().min(1),
    REGISTER_COMMANDS: zod_1.z.string().transform(val => val === 'true').default('false'),
    OPENAI_API_KEY: zod_1.z.string().min(1),
    ALLOWED_TOOLS: zod_1.z.string().default('http.get'),
    ALLOWED_HOSTS: zod_1.z.string().default('example.com'),
    MAX_HTTP_BYTES: zod_1.z.string().transform(Number).default('100000'),
    DATABASE_PATH: zod_1.z.string().default('./data/discourse.db'),
    API_BASE_URL: zod_1.z.string().url().default('http://agent-service:8080'),
    MCP_HTTP_URL: zod_1.z.string().url().default('http://mcp-http:3000'),
    LOG_LEVEL: zod_1.z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    REPLY_MODE: zod_1.z.enum(['inline', 'thread', 'auto']).default('inline'),
    MENTION_TRIGGER_ENABLED: zod_1.z.string().transform(v => v === 'true').default('true'),
    AUTO_THREAD_THRESHOLD: zod_1.z.string().transform(Number).default('1500'),
});
//# sourceMappingURL=types.js.map