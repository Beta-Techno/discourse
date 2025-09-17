import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from 'dotenv';
import { ConfigSchema, createLogger, type AgentCreateRunRequest, type AgentCreateRunResponse } from '@discourse/core';
import axios from 'axios';
import { StreamingClient, RunEvent } from './streaming-client.js';

// Load environment variables from project root
config({ path: '../../.env' });

// Belt-and-suspenders check for Web Streams
if (typeof globalThis.ReadableStream !== 'function') {
  throw new Error('ReadableStream is not available; verify preload or Node version.');
}

const config_ = ConfigSchema.parse(process.env);
const logger = createLogger(config_);

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Create REST client for command registration
const rest = new REST({ version: '10' }).setToken(config_.DISCORD_TOKEN);

// Command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the AI assistant a question')
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('Your question or request')
        .setRequired(true)
        .setMaxLength(2000)
    ),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with available commands'),
];

// Register commands
async function registerCommands() {
  if (!config_.REGISTER_COMMANDS) {
    logger.info('Command registration disabled');
    return;
  }

  try {
    logger.info('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(config_.DISCORD_APP_ID, config_.GUILD_ID),
      { body: commands },
    );

    logger.info('Successfully reloaded application (/) commands.');
  } catch (error) {
    logger.error('Failed to register commands:', error);
    console.error('Full error details:', error);
  }
}

// Handle slash command interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, channel } = interaction;

  try {
    if (commandName === 'ask') {
      await handleAskCommand(interaction);
    } else if (commandName === 'help') {
      await handleHelpCommand(interaction);
    }
  } catch (error) {
    logger.error({ commandName, userId: user.id, channelId: channel?.id }, 'Error handling command:', error);
    
    const errorMessage = 'Sorry, something went wrong. Please try again later.';
    
    if (interaction.deferred) {
      await interaction.editReply(errorMessage);
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

// --- New: @mention trigger in base channels ---
client.on('messageCreate', async (message) => {
  try {
    // Ignore DMs, system messages, bots (including ourselves)
    if (!message.inGuild() || message.author.bot) return;
    if (!config_.MENTION_TRIGGER_ENABLED) return;
    if (!client.user) return;

    // Fire only when the bot is mentioned
    const mentioned = message.mentions.users.has(client.user.id);
    if (!mentioned) return;
    
    logger.info({ 
      userId: message.author.id, 
      channelId: message.channel.id, 
      content: message.content 
    }, 'Bot mentioned, processing request');

    // Strip bot mention(s) from the content
    const raw = message.content ?? '';
    const botMentionA = `<@${client.user.id}>`;
    const botMentionB = `<@!${client.user.id}>`;
    const prompt = raw.replaceAll(botMentionA, '').replaceAll(botMentionB, '').trim();
    if (!prompt) return; // empty after stripping

    // Lightweight acknowledgement: typing + a reaction
    void message.channel.sendTyping();
    try { await message.react('🧠'); } catch {}

    // Build run request - new format
    const runRequest: AgentCreateRunRequest = {
      prompt,
      profileId: 'default', // Use default profile for now
      user: {
        provider: 'discord' as const,
        id: message.author.id,
      },
      context: {
        channelId: message.channel.id,
        replyToMessageId: message.id,
      },
    };

    // Call agent to create run
    logger.info({ runRequest }, 'Sending request to agent service');
    const response = await axios.post<AgentCreateRunResponse>(`${config_.API_BASE_URL}/runs`, runRequest, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
    logger.info({ runId: response.data.id }, 'Received run ID from agent service');

    const { id: runId } = response.data;

    // Start streaming the response
    await handleStreamingResponse(runId, message);

    try { await message.react('✅'); } catch {}
  } catch (err) {
    // Best-effort error surface; keep noise low
    try { await message.react('❌'); } catch {}
    logger.error({ err }, 'mention-trigger failed');
  }
});

// Handle streaming response from agent
async function handleStreamingResponse(runId: string, message: any) {
  let currentMessage: any = null;
  let messageBuffer = '';
  let isProcessing = false;
  let lastSentContent = '';

  const streamingClient = new StreamingClient(
    (event: RunEvent) => {
      logger.info({ eventType: event.type, data: event.data }, 'Received SSE event');
      switch (event.type) {
        case 'plan':
          // Optionally show plan
          break;
          
        case 'tool_call':
          // Show tool usage indicator
          if (!isProcessing) {
            isProcessing = true;
            message.channel.sendTyping();
          }
          break;
          
        case 'token':
          // Buffer tokens for real-time display (optional)
          messageBuffer += event.data.text;
          // Don't send individual tokens to avoid spam
          break;
          
        case 'message':
          // Send the complete final message
          if (event.data.content) {
            sendMessage(event.data.content);
            // Clear the buffer since we've sent the complete message
            messageBuffer = '';
          }
          break;
          
        case 'done':
          // Flush any buffered tokens then clean up
          sendChunk();
          streamingClient.disconnect();
          break;
          
        case 'error':
          // Send error message
          sendMessage(`❌ Error: ${event.data.message}`);
          streamingClient.disconnect();
          break;
      }
    },
    (error: Error) => {
      logger.error({ 
        error: error.message, 
        stack: error.stack, 
        runId 
      }, 'Streaming error');
      sendMessage(`❌ Connection error: ${error.message}`);
      streamingClient.disconnect();
    }
  );

  function sendChunk() {
    if (messageBuffer) {
      sendMessage(messageBuffer);
      messageBuffer = '';
    }
  }

  function sendMessage(content: string) {
    if (!content.trim()) return;
    
    // Skip if we've already sent this exact content
    if (content === lastSentContent) {
      logger.info({ content: content.substring(0, 50) + '...' }, 'Skipping duplicate message');
      return;
    }
    
    lastSentContent = content;
    logger.info({ content: content.substring(0, 100) + '...', runId }, 'Sending message to Discord');

    // Apply reply policy
    const replyMode = config_.REPLY_MODE; // 'inline' | 'thread' | 'auto'
    const autoThreshold = Number(config_.AUTO_THREAD_THRESHOLD ?? 1500);
    
    // Determine if we should create a thread
    const shouldCreateThread = replyMode === 'thread' || 
      (replyMode === 'auto' && content.length > autoThreshold);

    // Split long messages
    const chunks = splitMessage(content);
    
    chunks.forEach((chunk, index) => {
      if (index === 0 && !currentMessage) {
        // First chunk - apply reply policy
        if (shouldCreateThread) {
          // Create thread and post in thread
          currentMessage = message.startThread({ 
            name: `AI Response - ${new Date().toLocaleTimeString()}`,
            autoArchiveDuration: 60 // 1 hour
          }).then((thread: any) => thread.send(chunk));
        } else {
          // Inline reply
          currentMessage = message.reply(chunk);
        }
      } else {
        // Always send a new message; do not edit previously sent ones
        message.channel.send(chunk);
      }
    });
  }

  function splitMessage(content: string, maxLength: number = 1900): string[] {
    if (content.length <= maxLength) {
      return [content];
    }

    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find last newline before maxLength
      let splitPoint = maxLength;
      const lastNewline = remaining.lastIndexOf('\n', maxLength);
      if (lastNewline > maxLength * 0.8) {
        splitPoint = lastNewline;
      }

      chunks.push(remaining.substring(0, splitPoint));
      remaining = remaining.substring(splitPoint);
    }

    return chunks;
  }

  // Start streaming
  streamingClient.connect(runId, config_.API_BASE_URL);
}

async function handleAskCommand(interaction: any) {
  const prompt = interaction.options.getString('prompt', true);

  await interaction.deferReply({ ephemeral: true });

  const runRequest: AgentCreateRunRequest = {
    prompt,
    profileId: 'default',
    user: { provider: 'discord' as const, id: interaction.user.id },
    context: { channelId: interaction.channelId }
  };

  try {
    const { data } = await axios.post<AgentCreateRunResponse>(`${config_.API_BASE_URL}/runs`, runRequest, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    const runId = data.id as string;
    await interaction.editReply(`✅ Started run \`${runId}\`. I'll post the answer in this channel.`);

    // Stream to the same channel as the slash command
    const messageLike = {
      channel: interaction.channel,
      reply: (content: string) => interaction.followUp({ content, ephemeral: false }),
    };

    await handleStreamingResponse(runId, messageLike as any);

  } catch (error) {
    logger.error({ userId: interaction.user.id, channelId: interaction.channelId, prompt: prompt.substring(0, 100) }, 'Error in ask command:', error);
    
    let errorMessage = 'Sorry, I encountered an error processing your request.';
    
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        errorMessage = 'The AI service is currently unavailable. Please try again later.';
      } else if (error.response?.status === 400) {
        errorMessage = 'Invalid request. Please check your input and try again.';
      } else if (error.response && error.response.status >= 500) {
        errorMessage = 'The AI service is experiencing issues. Please try again later.';
      }
    }

    await interaction.editReply({ content: errorMessage });
  }
}

async function handleHelpCommand(interaction: any) {
  const helpMessage = `## Discourse AI Assistant

**Available Commands:**
- \`/ask <prompt>\` - Ask the AI assistant a question
- \`/help\` - Show this help message

**Features:**
- Ask questions and get AI-powered responses
- Automatic thread creation for conversations
- Safe web browsing for allowlisted domains
- Full audit logging of all interactions

**Example:**
\`/ask What's the weather like today?\`
\`/ask Fetch https://example.com and summarize the content\`

Need more help? Contact your system administrator.`;

  await interaction.reply({ content: helpMessage, ephemeral: true });
}

// Bot ready event
client.once('ready', () => {
  logger.info(`Discord bot ready! Logged in as ${client.user?.tag}`);
});

// Error handling
client.on('error', (error) => {
  logger.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Start the bot
async function start() {
  try {
    await registerCommands();
    await client.login(config_.DISCORD_TOKEN);
  } catch (error) {
    logger.error('Failed to start bot:', error);
    console.error('Full error details:', error);
    process.exit(1);
  }
}

start();
