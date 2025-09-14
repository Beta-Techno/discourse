"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = require("dotenv");
const core_1 = require("@discourse/core");
const axios_1 = __importDefault(require("axios"));
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
async function handleAskCommand(interaction) {
    const prompt = interaction.options.getString('prompt', true);
    const userId = interaction.user.id;
    const channelId = interaction.channelId;
    await interaction.deferReply({ ephemeral: true });
    try {
        const runRequest = core_1.CreateRunRequestSchema.parse({
            prompt,
            userId,
            channelId,
        });
        const response = await axios_1.default.post(`${config_.API_BASE_URL}/runs`, runRequest, {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const { id: runId, threadId, message } = response.data;
        await interaction.editReply({
            content: `✅ Run ${runId} complete → <#${threadId}>`,
        });
        logger.info({
            runId,
            userId,
            channelId,
            threadId,
            promptLength: prompt.length,
        }, 'Ask command completed successfully');
    }
    catch (error) {
        logger.error({ userId, channelId, prompt: prompt.substring(0, 100) }, 'Error in ask command:', error);
        console.error('Full ask command error details:', error);
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