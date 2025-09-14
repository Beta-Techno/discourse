"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runs = exports.users = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
exports.users = (0, sqlite_core_1.sqliteTable)('users', {
    discord_id: (0, sqlite_core_1.text)('discord_id').primaryKey(),
    email: (0, sqlite_core_1.text)('email'),
    created_at: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
exports.runs = (0, sqlite_core_1.sqliteTable)('runs', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    discord_id: (0, sqlite_core_1.text)('discord_id').notNull(),
    channel_id: (0, sqlite_core_1.text)('channel_id').notNull(),
    thread_id: (0, sqlite_core_1.text)('thread_id'),
    prompt: (0, sqlite_core_1.text)('prompt').notNull(),
    tools_used: (0, sqlite_core_1.text)('tools_used', { mode: 'json' }).$type(),
    status: (0, sqlite_core_1.text)('status', { enum: ['running', 'ok', 'blocked', 'error'] }).notNull(),
    error: (0, sqlite_core_1.text)('error'),
    latency_ms: (0, sqlite_core_1.integer)('latency_ms'),
    created_at: (0, sqlite_core_1.integer)('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
//# sourceMappingURL=schema.js.map