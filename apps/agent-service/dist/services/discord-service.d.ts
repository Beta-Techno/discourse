import { Config } from '@discourse/core';
export declare class DiscordService {
    private config;
    private logger;
    constructor(config: Config);
    sendReply(channelId: string, replyToMessageId: string | null, message: string): Promise<string>;
    private splitMessage;
    createThread(channelId: string, name: string, message: string): Promise<string>;
    sendMessage(channelId: string, message: string): Promise<void>;
}
//# sourceMappingURL=discord-service.d.ts.map