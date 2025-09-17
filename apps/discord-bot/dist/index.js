"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = require("dotenv");
const core_1 = require("@discourse/core");
const axios_1 = __importDefault(require("axios"));
const streaming_client_js_1 = require("./streaming-client.js");
(0, dotenv_1.config)({ path: '../../.env' });
if (typeof globalThis.ReadableStream !== 'function') {
    throw new Error('ReadableStream is not available; verify preload or Node version.');
}
const config_ = core_1.ConfigSchema.parse(process.env);
const logger = (0, core_1.createLogger)(config_);
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
    ],
});
const rest = new discord_js_1.REST({ version: '10' }).setToken(config_.DISCORD_TOKEN);
const commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask the AI assistant a question')
        .addStringOption(option => option
        .setName('prompt')
        .setDescription('Your question or request')
        .setRequired(true)
        .setMaxLength(2000)),
    new discord_js_1.SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with available commands'),
];
async function registerCommands() {
    if (!config_.REGISTER_COMMANDS) {
        logger.info('Command registration disabled');
        return;
    }
    try {
        logger.info('Started refreshing application (/) commands.');
        await rest.put(discord_js_1.Routes.applicationGuildCommands(config_.DISCORD_APP_ID, config_.GUILD_ID), { body: commands });
        logger.info('Successfully reloaded application (/) commands.');
    }
    catch (error) {
        logger.error('Failed to register commands:', error);
        console.error('Full error details:', error);
    }
}
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const { commandName, user, channel } = interaction;
    try {
        if (commandName === 'ask') {
            await handleAskCommand(interaction);
        }
        else if (commandName === 'help') {
            await handleHelpCommand(interaction);
        }
    }
    catch (error) {
        logger.error({ commandName, userId: user.id, channelId: channel?.id }, 'Error handling command:', error);
        const errorMessage = 'Sorry, something went wrong. Please try again later.';
        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        }
        else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});
client.on('messageCreate', async (message) => {
    try {
        if (!message.inGuild() || message.author.bot)
            return;
        if (!config_.MENTION_TRIGGER_ENABLED)
            return;
        if (!client.user)
            return;
        const mentioned = message.mentions.users.has(client.user.id);
        if (!mentioned)
            return;
        logger.info({
            userId: message.author.id,
            channelId: message.channel.id,
            content: message.content
        }, 'Bot mentioned, processing request');
        const raw = message.content ?? '';
        const botMentionA = `<@${client.user.id}>`;
        const botMentionB = `<@!${client.user.id}>`;
        const prompt = raw.replaceAll(botMentionA, '').replaceAll(botMentionB, '').trim();
        if (!prompt)
            return;
        void message.channel.sendTyping();
        try {
            await message.react('🧠');
        }
        catch { }
        const runRequest = {
            prompt,
            profileId: 'default',
            user: {
                provider: 'discord',
                id: message.author.id,
            },
            context: {
                channelId: message.channel.id,
                replyToMessageId: message.id,
            },
        };
        logger.info({ runRequest }, 'Sending request to agent service');
        const response = await axios_1.default.post(`${config_.API_BASE_URL}/runs`, runRequest, {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' },
        });
        logger.info({ runId: response.data.id }, 'Received run ID from agent service');
        const { id: runId } = response.data;
        await handleStreamingResponse(runId, message);
        try {
            await message.react('✅');
        }
        catch { }
    }
    catch (err) {
        try {
            await message.react('❌');
        }
        catch { }
        logger.error({ err }, 'mention-trigger failed');
    }
});
async function handleStreamingResponse(runId, message) {
    let currentMessage = null;
    let messageBuffer = '';
    let isProcessing = false;
    let lastSentContent = '';
    const streamingClient = new streaming_client_js_1.StreamingClient((event) => {
        logger.info({ eventType: event.type, data: event.data }, 'Received SSE event');
        switch (event.type) {
            case 'plan':
                break;
            case 'tool_call':
                if (!isProcessing) {
                    isProcessing = true;
                    message.channel.sendTyping();
                }
                break;
            case 'token':
                messageBuffer += event.data.text;
                break;
            case 'message':
                if (event.data.content) {
                    sendMessage(event.data.content);
                    messageBuffer = '';
                }
                break;
            case 'done':
                sendChunk();
                streamingClient.disconnect();
                break;
            case 'error':
                sendMessage(`❌ Error: ${event.data.message}`);
                streamingClient.disconnect();
                break;
        }
    }, (error) => {
        logger.error({
            error: error.message,
            stack: error.stack,
            runId
        }, 'Streaming error');
        sendMessage(`❌ Connection error: ${error.message}`);
        streamingClient.disconnect();
    });
    function sendChunk() {
        if (messageBuffer) {
            sendMessage(messageBuffer);
            messageBuffer = '';
        }
    }
    function sendMessage(content) {
        if (!content.trim())
            return;
        if (content === lastSentContent) {
            logger.info({ content: content.substring(0, 50) + '...' }, 'Skipping duplicate message');
            return;
        }
        lastSentContent = content;
        logger.info({ content: content.substring(0, 100) + '...', runId }, 'Sending message to Discord');
        const replyMode = config_.REPLY_MODE;
        const autoThreshold = Number(config_.AUTO_THREAD_THRESHOLD ?? 1500);
        const shouldCreateThread = replyMode === 'thread' ||
            (replyMode === 'auto' && content.length > autoThreshold);
        const chunks = splitMessage(content);
        chunks.forEach((chunk, index) => {
            if (index === 0 && !currentMessage) {
                if (shouldCreateThread) {
                    currentMessage = message.startThread({
                        name: `AI Response - ${new Date().toLocaleTimeString()}`,
                        autoArchiveDuration: 60
                    }).then((thread) => thread.send(chunk));
                }
                else {
                    currentMessage = message.reply(chunk);
                }
            }
            else {
                message.channel.send(chunk);
            }
        });
    }
    function splitMessage(content, maxLength = 1900) {
        if (content.length <= maxLength) {
            return [content];
        }
        const chunks = [];
        let remaining = content;
        while (remaining.length > 0) {
            if (remaining.length <= maxLength) {
                chunks.push(remaining);
                break;
            }
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
    streamingClient.connect(runId, config_.API_BASE_URL);
}
async function handleAskCommand(interaction) {
    const prompt = interaction.options.getString('prompt', true);
    await interaction.deferReply({ ephemeral: true });
    const runRequest = {
        prompt,
        profileId: 'default',
        user: { provider: 'discord', id: interaction.user.id },
        context: { channelId: interaction.channelId }
    };
    try {
        const { data } = await axios_1.default.post(`${config_.API_BASE_URL}/runs`, runRequest, {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' },
        });
        const runId = data.id;
        await interaction.editReply(`✅ Started run \`${runId}\`. I'll post the answer in this channel.`);
        const messageLike = {
            channel: interaction.channel,
            reply: (content) => interaction.followUp({ content, ephemeral: false }),
        };
        await handleStreamingResponse(runId, messageLike);
    }
    catch (error) {
        logger.error({ userId: interaction.user.id, channelId: interaction.channelId, prompt: prompt.substring(0, 100) }, 'Error in ask command:', error);
        let errorMessage = 'Sorry, I encountered an error processing your request.';
        if (axios_1.default.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                errorMessage = 'The AI service is currently unavailable. Please try again later.';
            }
            else if (error.response?.status === 400) {
                errorMessage = 'Invalid request. Please check your input and try again.';
            }
            else if (error.response && error.response.status >= 500) {
                errorMessage = 'The AI service is experiencing issues. Please try again later.';
            }
        }
        await interaction.editReply({ content: errorMessage });
    }
}
async function handleHelpCommand(interaction) {
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
client.once('ready', () => {
    logger.info(`Discord bot ready! Logged in as ${client.user?.tag}`);
});
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
async function start() {
    try {
        await registerCommands();
        await client.login(config_.DISCORD_TOKEN);
    }
    catch (error) {
        logger.error('Failed to start bot:', error);
        console.error('Full error details:', error);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=index.js.map