import axios from 'axios';
import { Config, createLogger } from '@discourse/core';

export class DiscordService {
  private config: Config;
  private logger: ReturnType<typeof createLogger>;

  constructor(config: Config) {
    this.config = config;
    this.logger = createLogger(config);
  }

  // New: reply in place (base channel), optionally referencing a message
  async sendReply(channelId: string, replyToMessageId: string | null, message: string): Promise<string> {
    try {
      // Discord has a 2000 character limit per message
      const MAX_MESSAGE_LENGTH = 1900; // Leave some buffer
      
      if (message.length <= MAX_MESSAGE_LENGTH) {
        // Single message - send normally
        const payload: any = {
          content: message,
          // Avoid accidental re-mentions
          allowed_mentions: { parse: [] },
        };
        if (replyToMessageId) {
          payload.message_reference = {
            message_id: replyToMessageId,
            fail_if_not_exists: false,
          };
        }
        const resp = await axios.post(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          payload,
          {
            headers: {
              'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );
        this.logger.info({ channelId, replyToMessageId, id: resp.data?.id }, 'Inline reply sent');
        return resp.data?.id as string;
      } else {
        // Long message - split into chunks
        this.logger.info({ channelId, messageLength: message.length }, 'Splitting long message into chunks');
        
        const chunks = this.splitMessage(message, MAX_MESSAGE_LENGTH);
        let lastMessageId = '';
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const isFirstChunk = i === 0;
          
          const payload: any = {
            content: chunk,
            // Avoid accidental re-mentions
            allowed_mentions: { parse: [] },
          };
          
          // Only add message reference to the first chunk
          if (isFirstChunk && replyToMessageId) {
            payload.message_reference = {
              message_id: replyToMessageId,
              fail_if_not_exists: false,
            };
          }
          
          const resp = await axios.post(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            payload,
            {
              headers: {
                'Authorization': `Bot ${this.config.DISCORD_TOKEN}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          lastMessageId = resp.data?.id as string;
          
          // Small delay between chunks to avoid rate limiting
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        this.logger.info({ channelId, chunks: chunks.length, lastMessageId }, 'Long message sent in chunks');
        return lastMessageId;
      }
    } catch (error) {
      this.logger.error({ channelId, replyToMessageId, error }, 'Failed to send inline reply');
      throw new Error(`Failed to send inline reply: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper method to split long messages intelligently
  private splitMessage(message: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = message;
    
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      
      // Try to split at a sentence boundary
      let splitPoint = maxLength;
      const lastSentence = remaining.lastIndexOf('.', maxLength);
      const lastNewline = remaining.lastIndexOf('\n', maxLength);
      
      // Prefer splitting at sentences, then newlines, then words
      if (lastSentence > maxLength * 0.7) {
        splitPoint = lastSentence + 1;
      } else if (lastNewline > maxLength * 0.7) {
        splitPoint = lastNewline + 1;
      } else {
        // Split at word boundary
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
