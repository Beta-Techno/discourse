import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Config, createLogger, OpenAIFunctionTool } from '@discourse/core';
import { McpServersFileSchema, McpServerConfig } from './serverConfig.js';

// NOTE: The exact import paths may vary slightly by SDK version.
// Cursor: if these imports fail, consult the @modelcontextprotocol/sdk docs
// and adjust the client & transport import paths accordingly.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type McpToolDef = {
  name: string;
  description?: string | undefined;
  inputSchema?: any; // JSON Schema if provided by server
};

type RegisteredTool = {
  server: string;
  def: McpToolDef;
};

function globMatch(name: string, patterns: string[]): boolean {
  const normalized = name.toLowerCase();
  return patterns.some((p) => {
    const pat = p.trim().toLowerCase();
    if (!pat) return false;
    if (pat === '*') return true;
    // simple glob: * wildcard only
    const regex = new RegExp('^' + pat.split('*').map(escapeRegExp).join('.*') + '$');
    return regex.test(normalized);
  });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class McpBroker {
  private config: Config;
  private logger: ReturnType<typeof createLogger>;
  private clients = new Map<string, Client>();
  private tools = new Map<string, RegisteredTool>(); // key = server.tool

  constructor(config: Config) {
    this.config = config;
    this.logger = createLogger(config);
  }

  async start(): Promise<void> {
    const filePath = path.resolve(process.cwd(), this.config.MCP_SERVERS_CONFIG);
    if (!fs.existsSync(filePath)) {
      this.logger.warn({ filePath }, 'MCP servers config not found; broker started with 0 servers');
      return;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = McpServersFileSchema.parse(JSON.parse(raw));

    for (const srv of parsed) {
      await this.connectServer(srv).catch((e) => {
        this.logger.error({ server: srv.name, error: e }, 'Failed to connect MCP server');
      });
    }
  }

  listFQNs(): string[] {
    return Array.from(this.tools.keys()).sort();
  }

  /**
   * Build OpenAI function tools from discovered MCP tools.
   * We use a conservative generic parameters shape (`args` as JSON string),
   * so we don't depend on each server providing full JSON Schema.
   */
  getOpenAIFunctionTools(allowedPatterns: string[]): OpenAIFunctionTool[] {
    const patterns = allowedPatterns
      .join(',')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const out: OpenAIFunctionTool[] = [];

    for (const [fqn, { server, def }] of this.tools) {
      if (!globMatch(fqn, patterns)) continue;

      const openaiName = this.toOpenAiFunctionName(server, def.name);

      out.push({
        type: 'function',
        function: {
          name: openaiName,
          description: def.description ?? `MCP tool ${fqn}`,
          parameters: {
            type: 'object',
            properties: {
              args: {
                type: 'string',
                description:
                  'JSON-encoded object of arguments for this MCP tool. Example: {"foo":"bar"}'
              }
            },
            required: ['args']
          }
        }
      });
    }

    return out;
  }

  async callByOpenAiName(openaiFunctionName: string, argsJson: string): Promise<any> {
    const { server, tool } = this.fromOpenAiFunctionName(openaiFunctionName);
    const client = this.clients.get(server);
    if (!client) throw new Error(`MCP server not connected: ${server}`);

    let args: any = {};
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch {
      throw new Error('Invalid JSON in "args"');
    }

    const res = await client.callTool({ name: tool, arguments: args });

    // Normalize content to something we can JSON.stringify
    // SDK typically returns { content: [{ type: 'text', text: '...' }, ...] }
    const safe = {
      content: res?.content ?? null,
      isError: res?.isError ?? false
    };
    return safe;
  }

  // ---------------- private helpers ----------------

  private async connectServer(srv: McpServerConfig) {
    let transport: any;

    if (srv.transport === 'stdio') {
      if (!srv.command) throw new Error('stdio transport requires "command"');
      transport = new StdioClientTransport({
        command: srv.command,
        args: srv.args ?? [],
        env: { ...process.env, ...(srv.env ?? {}) } as Record<string, string>
      });
    } else if (srv.transport === 'http') {
      if (!srv.url) throw new Error('http transport requires "url"');
      transport = new StreamableHTTPClientTransport(new URL(srv.url));
    } else {
      throw new Error(`Unsupported transport: ${srv.transport as string}`);
    }

    const client = new Client({
      name: 'discourse-agent',
      version: '0.1.0'
    });

    await client.connect(transport);
    this.clients.set(srv.name, client);

    const tools = await client.listTools();
    for (const t of tools.tools ?? []) {
      const def: McpToolDef = {
        name: t.name,
        description: t.description,
        inputSchema: (t as any).inputSchema // optional
      };
      this.tools.set(this.fqn(srv.name, def.name), { server: srv.name, def });
    }

    this.logger.info(
      { server: srv.name, toolCount: tools.tools?.length ?? 0 },
      'MCP server connected'
    );
  }

  private fqn(server: string, tool: string) {
    return `${server}.${tool}`;
  }

  private toOpenAiFunctionName(server: string, tool: string) {
    // Keep it simple and collision-safe
    return `mcp__${server}__${tool}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
  }

  private fromOpenAiFunctionName(fn: string): { server: string; tool: string } {
    if (!fn.startsWith('mcp__')) throw new Error(`Not an MCP function: ${fn}`);
    const parts = fn.split('__');
    if (parts.length < 3) throw new Error(`Malformed MCP function name: ${fn}`);
    // Re-join any remaining underscores for tool name
    const server = parts[1]!;
    const tool = parts.slice(2).join('__');
    return { server, tool };
  }
}
