import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  discord_id: text('discord_id').primaryKey(),
  email: text('email'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  discord_id: text('discord_id').notNull(),
  channel_id: text('channel_id').notNull(),
  thread_id: text('thread_id'),
  prompt: text('prompt').notNull(),
  tools_used: text('tools_used', { mode: 'json' }).$type<string[]>(),
  status: text('status', { enum: ['running', 'ok', 'blocked', 'error'] }).notNull(),
  error: text('error'),
  latency_ms: integer('latency_ms'),
  created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
