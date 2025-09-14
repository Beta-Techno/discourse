"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIService = void 0;
const openai_1 = __importDefault(require("openai"));
const core_1 = require("@discourse/core");
class OpenAIService {
    client;
    broker;
    config;
    logger;
    constructor(config, broker) {
        this.config = config;
        this.client = new openai_1.default({ apiKey: config.OPENAI_API_KEY });
        this.broker = broker;
        this.logger = (0, core_1.createLogger)(config);
    }
    getAvailableTools() {
        const allowed = this.config.MCP_ALLOWED_TOOLS.split(',').map(s => s.trim()).filter(Boolean);
        return this.broker.getOpenAIFunctionTools(allowed.length ? allowed : ['*']);
    }
    async processRequest(prompt, runId) {
        const startTime = Date.now();
        const toolsUsed = [];
        try {
            this.logger.info({ runId, promptLength: prompt.length }, 'Processing OpenAI request');
            const systemPrompt = `You are Discourse AI, a helpful company assistant that lives in Discord. 

You can help users with:
- Answering questions and providing information
- Fetching and summarizing content from any website using MCP tools
- Using MCP tools discovered at runtime (e.g., database, filesystem, fetch/cURL) via function calls
- General assistance and conversation

When you need to fetch information from the web, use the MCP fetch tools (mcp__fetch__fetch) which can access any website. Be concise but helpful in your responses.

When a user's request likely needs a tool:
- Prefer using a relevant MCP function tool first (schema-aware).
- For unknown parameters, ask for clarification or infer conservative defaults.
- Keep queries read-only and include LIMITs for data queries.
`;
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ];
            const availableTools = this.getAvailableTools();
            const requestParams = {
                model: 'gpt-4o-mini',
                messages,
                temperature: 0.7,
                max_tokens: 2000,
            };
            if (availableTools.length > 0) {
                requestParams.tools = availableTools;
                requestParams.tool_choice = 'auto';
            }
            const completion = await this.client.chat.completions.create(requestParams);
            let finalMessage = completion.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response.';
            const toolCalls = completion.choices[0]?.message?.tool_calls || [];
            if (toolCalls.length > 0) {
                this.logger.info({ runId, toolCallCount: toolCalls.length }, 'Processing tool calls');
                messages.push({
                    role: 'assistant',
                    content: completion.choices[0]?.message?.content || null,
                    tool_calls: toolCalls,
                });
                for (const toolCall of toolCalls) {
                    const fname = toolCall.function.name;
                    if (fname.startsWith('mcp__')) {
                        try {
                            const parsed = JSON.parse(toolCall.function.arguments || '{}');
                            const argsJson = typeof parsed.args === 'string' ? parsed.args : JSON.stringify(parsed);
                            const result = await this.broker.callByOpenAiName(fname, argsJson);
                            toolsUsed.push(`mcp:${fname}`);
                            messages.push({
                                role: 'tool',
                                content: JSON.stringify(result),
                                tool_call_id: toolCall.id,
                            });
                            this.logger.info({ runId, tool: fname }, 'MCP tool call completed');
                        }
                        catch (error) {
                            this.logger.error({ runId, error, tool: fname }, 'MCP tool call failed');
                            messages.push({
                                role: 'tool',
                                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                                tool_call_id: toolCall.id,
                            });
                        }
                    }
                }
                const finalCompletion = await this.client.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages,
                    temperature: 0.7,
                    max_tokens: 2000,
                });
                finalMessage = finalCompletion.choices[0]?.message?.content || finalMessage;
            }
            const latency = Date.now() - startTime;
            this.logger.info({ runId, latency, toolsUsed }, 'OpenAI request completed');
            return {
                message: finalMessage,
                toolsUsed,
            };
        }
        catch (error) {
            const latency = Date.now() - startTime;
            this.logger.error({ runId, latency, error }, 'OpenAI request failed');
            throw new Error(`AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
exports.OpenAIService = OpenAIService;
//# sourceMappingURL=openai-service.js.map