import { z } from 'zod';
export declare const UserSchema: z.ZodObject<{
    discord_id: z.ZodString;
    email: z.ZodNullable<z.ZodString>;
    created_at: z.ZodDefault<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    discord_id: string;
    email: string | null;
    created_at: Date;
}, {
    discord_id: string;
    email: string | null;
    created_at?: Date | undefined;
}>;
export declare const RunSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    discord_id: z.ZodString;
    channel_id: z.ZodString;
    thread_id: z.ZodNullable<z.ZodString>;
    prompt: z.ZodString;
    tools_used: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
    status: z.ZodEnum<["running", "ok", "blocked", "error"]>;
    error: z.ZodNullable<z.ZodString>;
    latency_ms: z.ZodNullable<z.ZodNumber>;
    created_at: z.ZodDefault<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    discord_id: string;
    created_at: Date;
    status: "running" | "ok" | "blocked" | "error";
    channel_id: string;
    thread_id: string | null;
    prompt: string;
    tools_used: string[] | null;
    error: string | null;
    latency_ms: number | null;
    id?: number | undefined;
}, {
    discord_id: string;
    status: "running" | "ok" | "blocked" | "error";
    channel_id: string;
    thread_id: string | null;
    prompt: string;
    tools_used: string[] | null;
    error: string | null;
    latency_ms: number | null;
    created_at?: Date | undefined;
    id?: number | undefined;
}>;
export declare const CreateRunRequestSchema: z.ZodObject<{
    prompt: z.ZodString;
    userId: z.ZodString;
    channelId: z.ZodString;
    threadId: z.ZodOptional<z.ZodString>;
    replyToMessageId: z.ZodOptional<z.ZodString>;
    replyMode: z.ZodOptional<z.ZodEnum<["inline", "thread", "auto"]>>;
}, "strip", z.ZodTypeAny, {
    prompt: string;
    userId: string;
    channelId: string;
    threadId?: string | undefined;
    replyToMessageId?: string | undefined;
    replyMode?: "inline" | "thread" | "auto" | undefined;
}, {
    prompt: string;
    userId: string;
    channelId: string;
    threadId?: string | undefined;
    replyToMessageId?: string | undefined;
    replyMode?: "inline" | "thread" | "auto" | undefined;
}>;
export declare const CreateRunResponseSchema: z.ZodObject<{
    id: z.ZodString;
    threadId: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    id: string;
    threadId: string;
}, {
    message: string;
    id: string;
    threadId: string;
}>;
export declare const MCPToolCallSchema: z.ZodObject<{
    name: z.ZodString;
    arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    name: string;
    arguments: Record<string, unknown>;
}, {
    name: string;
    arguments: Record<string, unknown>;
}>;
export declare const MCPHttpGetSchema: z.ZodObject<{
    url: z.ZodString;
    max_bytes: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    url: string;
    max_bytes: number;
}, {
    url: string;
    max_bytes?: number | undefined;
}>;
export declare const MCPHttpResponseSchema: z.ZodObject<{
    url: z.ZodString;
    status: z.ZodNumber;
    content_type: z.ZodNullable<z.ZodString>;
    body_snippet: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: number;
    url: string;
    content_type: string | null;
    body_snippet: string;
}, {
    status: number;
    url: string;
    content_type: string | null;
    body_snippet: string;
}>;
export declare const OpenAIFunctionToolSchema: z.ZodObject<{
    type: z.ZodLiteral<"function">;
    function: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        parameters: z.ZodObject<{
            type: z.ZodLiteral<"object">;
            properties: z.ZodRecord<z.ZodString, z.ZodObject<{
                type: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                type: string;
                description?: string | undefined;
            }, {
                type: string;
                description?: string | undefined;
            }>>;
            required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            type: "object";
            properties: Record<string, {
                type: string;
                description?: string | undefined;
            }>;
            required?: string[] | undefined;
        }, {
            type: "object";
            properties: Record<string, {
                type: string;
                description?: string | undefined;
            }>;
            required?: string[] | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, {
                type: string;
                description?: string | undefined;
            }>;
            required?: string[] | undefined;
        };
    }, {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, {
                type: string;
                description?: string | undefined;
            }>;
            required?: string[] | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, {
                type: string;
                description?: string | undefined;
            }>;
            required?: string[] | undefined;
        };
    };
    type: "function";
}, {
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, {
                type: string;
                description?: string | undefined;
            }>;
            required?: string[] | undefined;
        };
    };
    type: "function";
}>;
export type User = z.infer<typeof UserSchema>;
export type Run = z.infer<typeof RunSchema>;
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;
export type CreateRunResponse = z.infer<typeof CreateRunResponseSchema>;
export type MCPToolCall = z.infer<typeof MCPToolCallSchema>;
export type MCPHttpGet = z.infer<typeof MCPHttpGetSchema>;
export type MCPHttpResponse = z.infer<typeof MCPHttpResponseSchema>;
export type OpenAIFunctionTool = z.infer<typeof OpenAIFunctionToolSchema>;
export declare const ConfigSchema: z.ZodObject<{
    DISCORD_TOKEN: z.ZodString;
    DISCORD_APP_ID: z.ZodString;
    GUILD_ID: z.ZodString;
    REGISTER_COMMANDS: z.ZodDefault<z.ZodEffects<z.ZodString, boolean, string>>;
    OPENAI_API_KEY: z.ZodString;
    DATABASE_PATH: z.ZodDefault<z.ZodString>;
    API_BASE_URL: z.ZodDefault<z.ZodString>;
    MCP_SERVERS_CONFIG: z.ZodDefault<z.ZodString>;
    MCP_ALLOWED_TOOLS: z.ZodDefault<z.ZodString>;
    POSTGRES_URI: z.ZodOptional<z.ZodString>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<["fatal", "error", "warn", "info", "debug", "trace"]>>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "production", "test"]>>;
    REPLY_MODE: z.ZodDefault<z.ZodEnum<["inline", "thread", "auto"]>>;
    MENTION_TRIGGER_ENABLED: z.ZodDefault<z.ZodEffects<z.ZodString, boolean, string>>;
    AUTO_THREAD_THRESHOLD: z.ZodDefault<z.ZodEffects<z.ZodString, number, string>>;
}, "strip", z.ZodTypeAny, {
    DISCORD_TOKEN: string;
    DISCORD_APP_ID: string;
    GUILD_ID: string;
    REGISTER_COMMANDS: boolean;
    OPENAI_API_KEY: string;
    DATABASE_PATH: string;
    API_BASE_URL: string;
    MCP_SERVERS_CONFIG: string;
    MCP_ALLOWED_TOOLS: string;
    LOG_LEVEL: "error" | "fatal" | "warn" | "info" | "debug" | "trace";
    NODE_ENV: "development" | "production" | "test";
    REPLY_MODE: "inline" | "thread" | "auto";
    MENTION_TRIGGER_ENABLED: boolean;
    AUTO_THREAD_THRESHOLD: number;
    POSTGRES_URI?: string | undefined;
}, {
    DISCORD_TOKEN: string;
    DISCORD_APP_ID: string;
    GUILD_ID: string;
    OPENAI_API_KEY: string;
    REGISTER_COMMANDS?: string | undefined;
    DATABASE_PATH?: string | undefined;
    API_BASE_URL?: string | undefined;
    MCP_SERVERS_CONFIG?: string | undefined;
    MCP_ALLOWED_TOOLS?: string | undefined;
    POSTGRES_URI?: string | undefined;
    LOG_LEVEL?: "error" | "fatal" | "warn" | "info" | "debug" | "trace" | undefined;
    NODE_ENV?: "development" | "production" | "test" | undefined;
    REPLY_MODE?: "inline" | "thread" | "auto" | undefined;
    MENTION_TRIGGER_ENABLED?: string | undefined;
    AUTO_THREAD_THRESHOLD?: string | undefined;
}>;
export type Config = z.infer<typeof ConfigSchema>;
//# sourceMappingURL=types.d.ts.map