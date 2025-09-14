import axios from 'axios';
import { Config, createLogger } from '@discourse/core';

export class DiscordService {
  private config: Config;
  private logger: ReturnType<typeof createLogger>;

  constructor(config: Config) {
    this.config = config;
    this.logger = createLogger(config);
  }

  async createThread(channelId: string, name: string, message: string): Promise<string> {
    try {
      this.logger.info({ channelId, name }, 'Creating Discord thread');

      // Create thread
      const threadResponse = await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/threads`,
        {
          name,
          type: 11, // Public thread
          auto_archive_duration: 60, // 1 hour
        },
        {
          headers: {
            'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const threadId = threadResponse.data.id;

      // Send initial message to thread
      await axios.post(
        `https://discord.com/api/v10/channels/${threadId}/messages`,
        {
          content: message,
        },
        {
          headers: {
            'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      this.logger.info({ channelId, threadId, name }, 'Discord thread created successfully');

      return threadId;
    } catch (error) {
      this.logger.error({ channelId, name, error }, 'Failed to create Discord thread');
      throw new Error(`Failed to create Discord thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendMessage(channelId: string, message: string): Promise<void> {
    try {
      await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          content: message,
        },
        {
          headers: {
            'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      this.logger.info({ channelId }, 'Message sent to Discord channel');
    } catch (error) {
      this.logger.error({ channelId, error }, 'Failed to send Discord message');
      throw new Error(`Failed to send Discord message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
