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
    async sendReply(channelId, replyToMessageId, message) {
        try {
            const MAX_MESSAGE_LENGTH = 1900;
            if (message.length <= MAX_MESSAGE_LENGTH) {
                const payload = {
                    content: message,
                    allowed_mentions: { parse: [] },
                };
                if (replyToMessageId) {
                    payload.message_reference = {
                        message_id: replyToMessageId,
                        fail_if_not_exists: false,
                    };
                }
                const resp = await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/messages`, payload, {
                    headers: {
                        'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                });
                this.logger.info({ channelId, replyToMessageId, id: resp.data?.id }, 'Inline reply sent');
                return resp.data?.id;
            }
            else {
                this.logger.info({ channelId, messageLength: message.length }, 'Splitting long message into chunks');
                const chunks = this.splitMessage(message, MAX_MESSAGE_LENGTH);
                let lastMessageId = '';
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    const isFirstChunk = i === 0;
                    const payload = {
                        content: chunk,
                        allowed_mentions: { parse: [] },
                    };
                    if (isFirstChunk && replyToMessageId) {
                        payload.message_reference = {
                            message_id: replyToMessageId,
                            fail_if_not_exists: false,
                        };
                    }
                    const resp = await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/messages`, payload, {
                        headers: {
                            'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
                            'Content-Type': 'application/json',
                        },
                    });
                    lastMessageId = resp.data?.id;
                    if (i < chunks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                this.logger.info({ channelId, chunks: chunks.length, lastMessageId }, 'Long message sent in chunks');
                return lastMessageId;
            }
        }
        catch (error) {
            this.logger.error({ channelId, replyToMessageId, error }, 'Failed to send inline reply');
            throw new Error(`Failed to send inline reply: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    splitMessage(message, maxLength) {
        const chunks = [];
        let remaining = message;
        while (remaining.length > 0) {
            if (remaining.length <= maxLength) {
                chunks.push(remaining);
                break;
            }
            let splitPoint = maxLength;
            const lastSentence = remaining.lastIndexOf('.', maxLength);
            const lastNewline = remaining.lastIndexOf('\n', maxLength);
            if (lastSentence > maxLength * 0.7) {
                splitPoint = lastSentence + 1;
            }
            else if (lastNewline > maxLength * 0.7) {
                splitPoint = lastNewline + 1;
            }
            else {
                const lastSpace = remaining.lastIndexOf(' ', maxLength);
                if (lastSpace > maxLength * 0.7) {
                    splitPoint = lastSpace;
                }
            }
            chunks.push(remaining.substring(0, splitPoint).trim());
            remaining = remaining.substring(splitPoint).trim();
        }
        return chunks;
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