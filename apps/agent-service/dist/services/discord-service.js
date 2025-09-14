"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordService = void 0;
const axios_1 = __importDefault(require("axios"));
const core_1 = require("@discourse/core");
class DiscordService {
    config;
    logger;
    constructor(config) {
        this.config = config;
        this.logger = (0, core_1.createLogger)(config);
    }
    async createThread(channelId, name, message) {
        try {
            this.logger.info({ channelId, name }, 'Creating Discord thread');
            const threadResponse = await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/threads`, {
                name,
                type: 11,
                auto_archive_duration: 60,
            }, {
                headers: {
                    'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            const threadId = threadResponse.data.id;
            await axios_1.default.post(`https://discord.com/api/v10/channels/${threadId}/messages`, {
                content: message,
            }, {
                headers: {
                    'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            this.logger.info({ channelId, threadId, name }, 'Discord thread created successfully');
            return threadId;
        }
        catch (error) {
            this.logger.error({ channelId, name, error }, 'Failed to create Discord thread');
            throw new Error(`Failed to create Discord thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async sendMessage(channelId, message) {
        try {
            await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                content: message,
            }, {
                headers: {
                    'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            this.logger.info({ channelId }, 'Message sent to Discord channel');
        }
        catch (error) {
            this.logger.error({ channelId, error }, 'Failed to send Discord message');
            throw new Error(`Failed to send Discord message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
exports.DiscordService = DiscordService;
//# sourceMappingURL=discord-service.js.map