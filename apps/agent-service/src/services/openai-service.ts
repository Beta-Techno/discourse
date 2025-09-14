import OpenAI from 'openai';
import { Config, OpenAIFunctionTool, createLogger } from '@discourse/core';
import { MCPClient } from './mcp-client.js';
import { McpBroker } from '../mcp/broker.js';

export class OpenAIService {
  private client: OpenAI;
  private mcpClient: MCPClient;
  private broker: McpBroker;
  private config: Config;
  private logger: ReturnType<typeof createLogger>;

  constructor(config: Config, mcpClient: MCPClient, broker: McpBroker) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.mcpClient = mcpClient;
    this.broker = broker;
    this.logger = createLogger(config);
  }

  private getAvailableTools(): OpenAIFunctionTool[] {
    const tools: OpenAIFunctionTool[] = [];
    
    // Add HTTP GET tool if allowed (legacy shim)
    if (this.config.ALLOWED_TOOLS && this.config.ALLOWED_TOOLS.includes('http.get')) {
      tools.push({
        type: 'function',
        function: {
          name: 'http_get',
          description: 'Fetch content from an allowlisted URL (read-only). Use this to get current information from websites.',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The URL to fetch. Must be from an allowlisted domain.',
              },
            },
            required: ['url'],
          },
        },
      });
    }

    // Add dynamic tools from MCP servers
    const allowed = this.config.MCP_ALLOWED_TOOLS.split(',').map(s => s.trim()).filter(Boolean);
    tools.push(...this.broker.getOpenAIFunctionTools(allowed.length ? allowed : ['*']));

    return tools;
  }

  async processRequest(prompt: string, runId: string): Promise<{
    message: string;
    toolsUsed: string[];
  }> {
    const startTime = Date.now();
    const toolsUsed: string[] = [];
    
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

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const availableTools = this.getAvailableTools();
      
      const requestParams: any = {
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

      // Process tool calls
      if (toolCalls.length > 0) {
        this.logger.info({ runId, toolCallCount: toolCalls.length }, 'Processing tool calls');
        
        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: completion.choices[0]?.message?.content || null,
          tool_calls: toolCalls,
        });

        // Process each tool call
        for (const toolCall of toolCalls) {
          const fname = toolCall.function.name;
          if (fname === 'http_get') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              const result = await this.mcpClient.httpGet(args.url);
              toolsUsed.push('http.get');
              
              // Add tool result to messages
              messages.push({
                role: 'tool',
                content: JSON.stringify(result),
                tool_call_id: toolCall.id,
              });
              
              this.logger.info({ runId, url: args.url }, 'HTTP GET tool call completed');
            } catch (error) {
              this.logger.error({ runId, error }, 'HTTP GET tool call failed');
              
              // Add error result to messages
              messages.push({
                role: 'tool',
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tool_call_id: toolCall.id,
              });
            }
          } else if (fname.startsWith('mcp__')) {
            // Dynamic MCP tools
            try {
              // Our broker expects a single "args" JSON string field in parameters
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
            } catch (error) {
              this.logger.error({ runId, error, tool: fname }, 'MCP tool call failed');
              messages.push({
                role: 'tool',
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                tool_call_id: toolCall.id,
              });
            }
          }
        }

        // Get final response after tool calls
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

    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error({ runId, latency, error }, 'OpenAI request failed');
      
      throw new Error(`AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
