import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from 'dotenv';
import { ConfigSchema, createLogger, CreateRunRequestSchema, CreateRunResponse } from '@discourse/core';
import axios from 'axios';

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

    // Strip bot mention(s) from the content
    const raw = message.content ?? '';
    const botMentionA = `<@${client.user.id}>`;
    const botMentionB = `<@!${client.user.id}>`;
    const prompt = raw.replaceAll(botMentionA, '').replaceAll(botMentionB, '').trim();
    if (!prompt) return; // empty after stripping

    // Lightweight acknowledgement: typing + a reaction
    void message.channel.sendTyping();
    try { await message.react('🧠'); } catch {}

    // Build run request - inline reply to the triggering message
    const runRequest = {
      prompt,
      userId: message.author.id,
      channelId: message.channel.id,
      replyToMessageId: message.id,
      replyMode: config_.REPLY_MODE, // 'inline' | 'thread' | 'auto'
    };

    // Validate shape (defense-in-depth)
    CreateRunRequestSchema.parse(runRequest);

    // Call agent to process; agent will post the response into the channel/reply
    await axios.post<CreateRunResponse>(`${config_.API_BASE_URL}/runs`, runRequest, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    try { await message.react('✅'); } catch {}
  } catch (err) {
    // Best-effort error surface; keep noise low
    try { await message.react('❌'); } catch {}
    logger.error({ err }, 'mention-trigger failed');
  }
});

async function handleAskCommand(interaction: any) {
  const prompt = interaction.options.getString('prompt', true);
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  // Defer the reply immediately
  await interaction.deferReply({ ephemeral: true });

  try {
    // Create run request
    const runRequest = CreateRunRequestSchema.parse({
      prompt,
      userId,
      channelId,
    });

    // Call agent service
    const response = await axios.post<CreateRunResponse>(
      `${config_.API_BASE_URL}/runs`,
      runRequest,
      {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const { id: runId, threadId, message } = response.data;

    // Update the deferred reply with success message
    // In inline mode there's no thread; we link back to the channel instead
    const target = config_.REPLY_MODE === 'thread' ? `<#${threadId}>` : `<#${channelId}>`;
    await interaction.editReply(`✅ Run ${runId} complete → ${target}`);

    logger.info({
      runId,
      userId,
      channelId,
      threadId,
      promptLength: prompt.length,
    }, 'Ask command completed successfully');

  } catch (error) {
    logger.error({ userId, channelId, prompt: prompt.substring(0, 100) }, 'Error in ask command:', error);
    console.error('Full ask command error details:', error);
    
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
