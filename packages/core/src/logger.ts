import pino from 'pino';
import { Config } from './types.js';

export function createLogger(config: Config, runId?: string) {
  const baseLogger = pino({
    level: config.LOG_LEVEL,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(config.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  });

  if (runId) {
    return baseLogger.child({ runId });
  }

  return baseLogger;
}

export type Logger = ReturnType<typeof createLogger>;
