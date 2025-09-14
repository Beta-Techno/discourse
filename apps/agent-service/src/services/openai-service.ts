import OpenAI from 'openai';
import { Config, OpenAIFunctionTool, createLogger } from '@discourse/core';
import { McpBroker } from '../mcp/broker.js';

export class OpenAIService {
  private client: OpenAI;
  private broker: McpBroker;
  private config: Config;
  private logger: ReturnType<typeof createLogger>;

  constructor(config: Config, broker: McpBroker) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.broker = broker;
    this.logger = createLogger(config);
  }

  private getAvailableTools(): OpenAIFunctionTool[] {
    // Add dynamic tools from MCP servers
    const allowed = this.config.MCP_ALLOWED_TOOLS.split(',').map(s => s.trim()).filter(Boolean);
    return this.broker.getOpenAIFunctionTools(allowed.length ? allowed : ['*']);
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
- Querying PostgreSQL databases with read-only access using MCP tools
- Using MCP tools discovered at runtime (e.g., database, filesystem, fetch/cURL) via function calls
- General assistance and conversation

When you need to fetch information from the web, use the MCP fetch tools (mcp__fetch__fetch) which can access any website.

When you need to query a database, use the MCP PostgreSQL tools (mcp__postgres__*) which provide safe, read-only access to PostgreSQL databases.

IMPORTANT: For database queries, you can and should make multiple tool calls in sequence to fully answer the user's question. For example:
1. First, list schemas to understand the database structure
2. Then, list objects (tables) in the relevant schema to see what tables actually exist
3. Check the table names from step 2 before trying to query them
4. Finally, get details about specific tables or execute queries on tables that actually exist

Be concise but helpful in your responses.

When a user's request likely needs a tool:
- Prefer using a relevant MCP function tool first (schema-aware).
- For unknown parameters, ask for clarification or infer conservative defaults.
- Keep queries read-only and include LIMITs for data queries.
- For database queries, always use LIMIT clauses to prevent large result sets.
- Make multiple tool calls as needed to fully answer the user's question.

SQL Query Guidelines:
- Use ONLY basic SQL: SELECT * FROM table_name LIMIT 10
- Always include LIMIT clauses (e.g., LIMIT 10)
- Use proper table and column names (case-sensitive)
- NO joins, subqueries, or complex WHERE clauses
- Start with: SELECT * FROM table_name LIMIT 5
- If that works, then try: SELECT column1, column2 FROM table_name LIMIT 5
- CRITICAL: Only query tables that actually exist (check with list_objects first)
- If a table doesn't exist, tell the user what tables are available instead
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

      // Process tool calls (with multi-round support)
      let currentCompletion = completion;
      let roundCount = 0;
      const maxRounds = 5; // Prevent infinite loops

      while (currentCompletion.choices[0]?.message?.tool_calls && roundCount < maxRounds) {
        const toolCalls = currentCompletion.choices[0]?.message?.tool_calls || [];
        this.logger.info({ runId, toolCallCount: toolCalls.length, round: roundCount + 1 }, 'Processing tool calls');
        
        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: currentCompletion.choices[0]?.message?.content || null,
          tool_calls: toolCalls,
        });

        // Process each tool call
        for (const toolCall of toolCalls) {
          const fname = toolCall.function.name;
          if (fname.startsWith('mcp__')) {
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

        // Get next response after tool calls
        currentCompletion = await this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 2000,
          tools: availableTools,
          tool_choice: 'auto',
        });

        roundCount++;
      }

      finalMessage = currentCompletion.choices[0]?.message?.content || finalMessage;

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
