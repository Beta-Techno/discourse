import { z } from 'zod';

// Database schemas
export const UserSchema = z.object({
  discord_id: z.string().max(32),
  email: z.string().email().nullable(),
  created_at: z.date().default(() => new Date()),
});

export const RunSchema = z.object({
  id: z.number().int().positive().optional(),
  discord_id: z.string().max(32),
  channel_id: z.string().max(32),
  thread_id: z.string().max(32).nullable(),
  prompt: z.string(),
  tools_used: z.array(z.string()).nullable(),
  status: z.enum(['running', 'ok', 'blocked', 'error']),
  error: z.string().nullable(),
  latency_ms: z.number().int().nullable(),
  created_at: z.date().default(() => new Date()),
});

// API schemas
export const CreateRunRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  userId: z.string().max(32),
  channelId: z.string().max(32),
  threadId: z.string().max(32).optional(),
  // New: reply inline to a specific message (when triggered by @mention)
  replyToMessageId: z.string().max(32).optional(),
  // New: per-request override (falls back to config)
  replyMode: z.enum(['inline','thread','auto']).optional(),
});

export const CreateRunResponseSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  message: z.string(),
});

// MCP schemas
export const MCPToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()),
});

export const MCPHttpGetSchema = z.object({
  url: z.string().url(),
  max_bytes: z.number().int().positive().optional().default(100000),
});

export const MCPHttpResponseSchema = z.object({
  url: z.string(),
  status: z.number().int(),
  content_type: z.string().nullable(),
  body_snippet: z.string(),
});

// OpenAI function tool schema
export const OpenAIFunctionToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.object({
      type: z.literal('object'),
      properties: z.record(z.object({
        type: z.string(),
        description: z.string().optional(),
      })),
      required: z.array(z.string()).optional(),
    }),
  }),
});

// Type exports
export type User = z.infer<typeof UserSchema>;
export type Run = z.infer<typeof RunSchema>;
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;
export type CreateRunResponse = z.infer<typeof CreateRunResponseSchema>;
export type MCPToolCall = z.infer<typeof MCPToolCallSchema>;
export type MCPHttpGet = z.infer<typeof MCPHttpGetSchema>;
export type MCPHttpResponse = z.infer<typeof MCPHttpResponseSchema>;
export type OpenAIFunctionTool = z.infer<typeof OpenAIFunctionToolSchema>;

// Environment configuration
export const ConfigSchema = z.object({
  // Discord
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APP_ID: z.string().min(1),
  GUILD_ID: z.string().min(1),
  REGISTER_COMMANDS: z.string().transform(val => val === 'true').default('false'),
  
  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  
  // Tools
  ALLOWED_TOOLS: z.string().default('http.get'),
  ALLOWED_HOSTS: z.string().default('example.com'),
  MAX_HTTP_BYTES: z.string().transform(Number).default('100000'),
  
  // Database
  DATABASE_PATH: z.string().default('./data/discourse.db'),
  
  // Service URLs
  API_BASE_URL: z.string().url().default('http://agent-service:8080'),
  MCP_HTTP_URL: z.string().url().default('http://mcp-http:3000'),
  
  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // New reply behavior
  REPLY_MODE: z.enum(['inline','thread','auto']).default('inline'),
  MENTION_TRIGGER_ENABLED: z.string().transform(v => v === 'true').default('true'),
  AUTO_THREAD_THRESHOLD: z.string().transform(Number).default('1500'),
});

export type Config = z.infer<typeof ConfigSchema>;
