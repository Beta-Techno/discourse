"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
function createLogger(config, runId) {
    const baseLogger = (0, pino_1.default)({
        level: config.LOG_LEVEL,
        formatters: {
            level: (label) => ({ level: label }),
        },
        timestamp: pino_1.default.stdTimeFunctions.isoTime,
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
//# sourceMappingURL=logger.js.map