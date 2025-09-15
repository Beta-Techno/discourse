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
- Managing Gmail (send, read, search, labels) using MCP tools
- Using MCP tools discovered at runtime (e.g., database, filesystem, fetch/cURL) via function calls
- General assistance and conversation

When you need to fetch information from the web, use the MCP fetch tools (mcp__fetch__fetch) which can access any website.

When you need to query a database, use the MCP PostgreSQL tools (mcp__postgres__*) which provide safe, read-only access to PostgreSQL databases.

When you need to manage emails, use the MCP Gmail tools (mcp__gmail__*) which provide comprehensive email management.

IMPORTANT: For database queries, you can and should make multiple tool calls in sequence to fully answer the user's question. For example:
1. First, list schemas to understand the database structure
2. Then, list objects (tables) in the relevant schema to see what tables actually exist
3. Check the table names from step 2 before trying to query them
4. Finally, get details about specific tables or execute queries on tables that actually exist

For Gmail requests, you can make multiple tool calls to:
1. Search for emails using mcp__gmail__search_emails
2. Read specific emails using mcp__gmail__read_email
3. List labels using mcp__gmail__list_email_labels
4. Get email details and attachments

Be concise but helpful in your responses. Always provide a summary of what you found when using tools.

When a user's request likely needs a tool:
- Prefer using a relevant MCP function tool first (schema-aware).
- For unknown parameters, ask for clarification or infer conservative defaults.
- Keep queries read-only and include LIMITs for data queries.
- For database queries, always use LIMIT clauses to prevent large result sets.
- Make multiple tool calls as needed to fully answer the user's question.
- For Gmail requests, always provide a summary of the email content you found.

SQL Query Guidelines:
- Use ONLY basic SQL: SELECT * FROM table_name LIMIT 10
- Always include LIMIT clauses (e.g., LIMIT 10)
- Use proper table and column names (case-sensitive)
- NO joins, subqueries, or complex WHERE clauses
- Start with: SELECT * FROM table_name LIMIT 5
- If that works, then try: SELECT column1, column2 FROM table_name LIMIT 5
- CRITICAL: Only query tables that actually exist (check with list_objects first)
- If a table doesn't exist, tell the user what tables are available instead

Gmail Guidelines:
- Use search_emails with parameter "query" (e.g., {"query": "is:unread"}, {"query": "has:attachment"}, {"query": "from:user@example.com"})
- Use read_email with parameter "messageId" (e.g., {"messageId": "email_id_here"})
- Use list_email_labels with no parameters (e.g., {})
- Always include maxResults parameter for search_emails to limit results (e.g., {"query": "is:unread", "maxResults": 5})
- When asked about attachments, use attachment tools to download and read the actual file contents
- For PDFs and documents, use attachment tools to extract and read the text content
- Always summarize the email content you find for the user
- If you find attachments, download and read them to provide actual content, not just file names

IMPORTANT: When downloading attachments, the Gmail MCP server will return a success message like:
"Attachment downloaded successfully:\nFile: [filename]\nSize: [bytes] bytes\nSaved to: [path]"
This means the download worked! The file is saved and you can then read its contents.

For PDF attachments, use the PyMuPDF4LLM MCP server (mcp__pymupdf4llm__convert_pdf_to_markdown) to convert the PDF to Markdown format.

The PyMuPDF4LLM tool will return a JSON response with a "markdown_path" field pointing to the converted file. After getting this response, you MUST:
1. Use the filesystem MCP server (mcp__filesystem__read_file) with the exact path from markdown_path
2. Call it like: {"path": "/private/tmp/gmail-attachments/converted-invoice.md"}
3. Read and analyze the Markdown content from the filesystem response
4. Extract key information (dates, amounts, names, project details, etc.)
5. Provide a clear summary to the user

CRITICAL: Do not stop after PyMuPDF4LLM conversion. You must use the filesystem tool to read the converted file content.

MANDATORY WORKFLOW FOR PDF ATTACHMENTS:
1. Download PDF with Gmail MCP
2. Convert PDF with PyMuPDF4LLM MCP (gets markdown_path)
3. IMMEDIATELY use filesystem MCP to read the file at markdown_path
4. Analyze the content and provide summary

DO NOT STOP AT STEP 2. ALWAYS PROCEED TO STEP 3.

EXAMPLE: If PyMuPDF4LLM returns {"markdown_path": "/private/tmp/gmail-attachments/converted-invoice.md"}, 
then IMMEDIATELY call mcp__filesystem__read_file with {"path": "/private/tmp/gmail-attachments/converted-invoice.md"}

For other file types, you can use the filesystem tool to read local files or the fetch tool for web URLs.

Example workflow:
1. Download attachment with Gmail MCP → get success message with file path
2. If it's a PDF, use PyMuPDF4LLM to convert to Markdown → get markdown_path
3. Use filesystem MCP to read the file at markdown_path
4. Extract and summarize the key information for the user
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
      
      // Debug logging for empty responses
      if (!completion.choices[0]?.message?.content) {
        this.logger.warn({ runId }, 'AI returned empty initial content');
      }
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

      const newContent = currentCompletion.choices[0]?.message?.content;
      if (newContent) {
        finalMessage = newContent;
      } else {
        this.logger.warn({ runId, round: roundCount }, 'AI returned empty content after tool calls');
        // Provide a fallback message based on tools used
        if (toolsUsed.some(tool => tool.includes('gmail'))) {
          if (toolsUsed.some(tool => tool.includes('download_attachment'))) {
            finalMessage = 'I successfully downloaded the email attachment, but I\'m having trouble processing the results. The attachment was saved and I can try to read it again if you ask.';
          } else {
            finalMessage = 'I found some emails in your Gmail account, but I\'m having trouble processing the results. Please try asking a more specific question about your emails.';
          }
        } else if (toolsUsed.some(tool => tool.includes('postgres'))) {
          finalMessage = 'I queried the database successfully, but I\'m having trouble processing the results. Please try asking a more specific question about the data.';
        } else if (toolsUsed.some(tool => tool.includes('fetch'))) {
          finalMessage = 'I fetched the web content successfully, but I\'m having trouble processing the results. Please try asking a more specific question about the content.';
        } else {
          finalMessage = 'I used some tools to help with your request, but I\'m having trouble processing the results. Please try asking a more specific question.';
        }
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
