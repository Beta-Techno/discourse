import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  driver: 'mysql2',
  dbCredentials: {
    host: process.env.MYSQL_HOST || 'mysql',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'assistant',
    password: process.env.MYSQL_PASSWORD || 'assistant',
    database: process.env.MYSQL_DB || 'assistant',
  },
} satisfies Config;
