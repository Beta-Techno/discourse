"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
async function runMigrations(config) {
    const db = new better_sqlite3_1.default(config.DATABASE_PATH || './data/discourse.db');
    try {
        db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        email TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        thread_id TEXT,
        prompt TEXT NOT NULL,
        tools_used TEXT,
        status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'blocked', 'error')),
        error TEXT,
        latency_ms INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_runs_discord_id ON runs(discord_id);
      CREATE INDEX IF NOT EXISTS idx_runs_channel_id ON runs(channel_id);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
    `);
        console.log('Database migrations completed successfully');
    }
    catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
    finally {
        db.close();
    }
}
//# sourceMappingURL=migrations.js.map