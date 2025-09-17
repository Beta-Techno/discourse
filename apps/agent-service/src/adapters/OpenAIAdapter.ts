import OpenAI from 'openai';
import type { ModelAdapter, ChatMessage, ToolCall } from './ModelAdapter.js';
import type { McpBroker } from '../mcp/broker.js';

export class OpenAIAdapter implements ModelAdapter {
  name = 'openai';
  provider = 'openai';
  
  private client: OpenAI;
  private mcpBroker: McpBroker;

  constructor(apiKey: string, mcpBroker: McpBroker) {
    this.client = new OpenAI({ apiKey });
    this.mcpBroker = mcpBroker;
  }

  async chat(opts: {
    messages: ChatMessage[];
    tools?: any[];
    onEvent: (ev: {
      type: 'token' | 'tool_call' | 'message' | 'done' | 'error';
      data: any;
    }) => void;
    toolChoice?: 'auto' | 'required' | { name: string };
    temperature?: number;
    maxSteps?: number;
  }): Promise<{ final: string }> {
    const { messages, tools, onEvent, toolChoice, temperature = 0.7, maxSteps = 10 } = opts;

    try {
      let currentMessages = [...messages];
      let stepCount = 0;

      while (stepCount < maxSteps) {
        stepCount++;

        // Use non-streaming for conversation loop to get complete tool calls
        const response = await this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: currentMessages as any,
          tools: tools as any,
          tool_choice: toolChoice as any,
          temperature,
          stream: false,
        } as any);

        const choice = response.choices[0];
        if (!choice) continue;

        const message = choice.message;
        const finalMessage = message.content || '';

        // If we have tool calls, execute them
        if (message.tool_calls && message.tool_calls.length > 0) {
          // Emit tool call events for streaming display
          for (const toolCall of message.tool_calls) {
            onEvent({
              type: 'tool_call',
              data: {
                id: toolCall.id,
                name: toolCall.function?.name,
                arguments: toolCall.function?.arguments
              }
            });
          }

          // Add assistant message with tool calls
          currentMessages.push({
            role: 'assistant',
            content: finalMessage,
            tool_calls: message.tool_calls
          });

          // Execute each tool call
          for (const toolCall of message.tool_calls) {
            try {
              // Handle MCP tool calls the same way as the old OpenAIService
              const parsed = JSON.parse(toolCall.function.arguments || '{}');
              const argsJson = typeof parsed.args === 'string' ? parsed.args : JSON.stringify(parsed);
              const result = await this.mcpBroker.callByOpenAiName(toolCall.function.name, argsJson);
              
              // Add tool result to messages
              currentMessages.push({
                role: 'tool',
                content: JSON.stringify(result),
                tool_call_id: toolCall.id
              });
            } catch (error) {
              // Add error result to messages
              currentMessages.push({
                role: 'tool',
                content: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
                tool_call_id: toolCall.id
              });
            }
          }

          // Continue the conversation loop to get AI response
          continue;
        }

        // No tool calls, we have a final response - stream it
        if (finalMessage) {
          // Stream the final response
          const words = finalMessage.split(' ');
          for (const word of words) {
            onEvent({
              type: 'token',
              data: { text: word + ' ' }
            });
            // Small delay for streaming effect
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }

        onEvent({
          type: 'message',
          data: { role: 'assistant', content: finalMessage }
        });

        onEvent({
          type: 'done',
          data: { status: 'ok' }
        });

        return { final: finalMessage };
      }

      // Max steps exceeded
      onEvent({
        type: 'error',
        data: { message: 'Maximum steps exceeded' }
      });

      return { final: 'Maximum steps exceeded' };

    } catch (error) {
      onEvent({
        type: 'error',
        data: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }
}
