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
          // Prefer the server's actual input schema; fall back to generic
          parameters: def.inputSchema ?? {
            type: 'object',
            properties: {
              args: {
                type: 'string',
                description: 'JSON-encoded object of arguments. Example: {"query":"SELECT 1"}'
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
    let client = this.clients.get(server);
    if (!client) {
      this.logger.warn({ server }, 'MCP server not connected; attempting reconnect');
      await this.start(); // re-read config and reconnect all servers
      client = this.clients.get(server);
    }
    if (!client) throw new Error(`MCP server not connected: ${server}`);

    let args: any = {};
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch {
      throw new Error('Invalid JSON in "args"');
    }

    // Special handling for Gmail download_attachment to fix filename length issues
    // Workspace MCP exposes Gmail tools under the google-workspace server,
    // with tool names like "gmail.download_attachment"
    if (server === 'google-workspace' && tool.endsWith('download_attachment')) {
      args = this.fixGmailAttachmentDownloadArgs(args);
    }

    // Note: Google Workspace MCP handles shared drive access internally
    // No need to add shared drive flags as the MCP server manages this automatically

    // Debug logging for PostgreSQL queries
    if (server === 'postgres' && args.query) {
      this.logger.info({ tool, query: args.query }, 'Executing PostgreSQL query');
    }
    
    // Debug logging for Gmail tools
    if (server === 'gmail') {
      this.logger.info({ tool, args }, 'Executing Gmail tool');
    }

    // Debug logging for fetch tool
    if (server === 'fetch') {
      this.logger.info({ tool, args, originalArgsJson: argsJson }, 'Executing fetch tool');
    }

    const res = await client.callTool({ name: tool, arguments: args });

    // Debug logging for Gmail tool responses
    if (server === 'gmail') {
      this.logger.info({ tool, responseSize: JSON.stringify(res).length }, 'Gmail tool response received');
      if (res?.content && Array.isArray(res.content)) {
        this.logger.info({ tool, contentTypes: res.content.map(c => c.type), contentLengths: res.content.map(c => c.text?.length || 0) }, 'Gmail content details');
        // Log first 200 characters of text content for debugging
        const textContent = res.content.find(c => c.type === 'text')?.text;
        if (textContent) {
          this.logger.info({ tool, preview: textContent.substring(0, 200) }, 'Gmail content preview');
        }
      }
    }

    // Debug logging for PyMuPDF4LLM tool responses
    if (server === 'pymupdf4llm') {
      this.logger.info({ tool, responseSize: JSON.stringify(res).length }, 'PyMuPDF4LLM tool response received');
      if (res?.content && Array.isArray(res.content)) {
        this.logger.info({ tool, contentTypes: res.content.map(c => c.type), contentLengths: res.content.map(c => c.text?.length || 0) }, 'PyMuPDF4LLM content details');
        // Log first 500 characters of text content for debugging
        const textContent = res.content.find(c => c.type === 'text')?.text;
        if (textContent) {
          this.logger.info({ tool, preview: textContent.substring(0, 500) }, 'PyMuPDF4LLM content preview');
        }
      }
    }

    // Debug logging for filesystem tool responses
    if (server === 'filesystem') {
      this.logger.info({ tool, responseSize: JSON.stringify(res).length }, 'Filesystem tool response received');
      if (res?.content && Array.isArray(res.content)) {
        this.logger.info({ tool, contentTypes: res.content.map(c => c.type), contentLengths: res.content.map(c => c.text?.length || 0) }, 'Filesystem content details');
        // Log first 500 characters of text content for debugging
        const textContent = res.content.find(c => c.type === 'text')?.text;
        if (textContent) {
          this.logger.info({ tool, preview: textContent.substring(0, 500) }, 'Filesystem content preview');
        }
      }
    }

    // Normalize content to something we can JSON.stringify
    // SDK typically returns { content: [{ type: 'text', text: '...' }, ...] }
    const safe = {
      content: res?.content ?? null,
      isError: res?.isError ?? false
    };
    return safe;
  }

  // ---------------- private helpers ----------------

  private fixGmailAttachmentDownloadArgs(args: any): any {
    const SAVE_DIR = '/tmp/gmail-attachments';
    
    // Ensure the directory exists
    try {
      fs.mkdirSync(SAVE_DIR, { recursive: true });
    } catch (error) {
      this.logger.warn({ error, saveDir: SAVE_DIR }, 'Failed to create Gmail attachment directory');
    }

    // If savePath and filename are already provided, use them
    if (args.savePath && args.filename) {
      return args;
    }

    // Generate a safe filename
    const attachmentId = args.attachmentId || '';
    const originalName = args.filename || '';
    const mimeType = args.mimeType || '';
    
    // Create a safe filename that won't exceed filesystem limits
    const safeFilename = this.createSafeFilename(originalName, attachmentId, mimeType);
    
    return {
      ...args,
      savePath: SAVE_DIR,
      filename: safeFilename
    };
  }

  private createSafeFilename(originalName: string, attachmentId: string, mimeType?: string, maxLength: number = 120): string {
    // Remove invalid filesystem characters
    const badChars = /[\/\\:*?"<>|]/g;
    const sanitized = (originalName || '').replace(badChars, '_');
    
    // Parse the filename to get extension
    const parsed = path.parse(sanitized);
    const ext = parsed.ext || '';
    const base = parsed.name || '';
    
    // Determine extension from MIME type if available
    let finalExt = ext;
    if (!finalExt && mimeType) {
      if (mimeType.includes('pdf')) finalExt = '.pdf';
      else if (mimeType.includes('zip')) finalExt = '.zip';
      else if (mimeType.includes('image')) finalExt = '.jpg';
      else if (mimeType.includes('text')) finalExt = '.txt';
    }
    
    // Create fallback name from attachment ID
    const fallbackBase = `attachment-${attachmentId.slice(0, 16)}`;
    
    // Use original name if it's reasonable, otherwise use fallback
    const useBase = base && base.length <= 50 ? base : fallbackBase;
    
    // Ensure total length doesn't exceed maxLength
    const maxBaseLength = Math.max(1, maxLength - finalExt.length);
    const finalBase = useBase.length > maxBaseLength ? useBase.slice(0, maxBaseLength) : useBase;
    
    return `${finalBase}${finalExt}`;
  }

  private substituteEnvVars(env: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      result[key] = value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        const envValue = process.env[varName];
        if (envValue === undefined) {
          this.logger.warn({ varName, key }, 'Environment variable not found, using empty string');
          return '';
        }
        return envValue;
      });
    }
    return result;
  }

  private async connectServer(srv: McpServerConfig) {
    let transport: any;

    if (srv.transport === 'stdio') {
      if (!srv.command) throw new Error('stdio transport requires "command"');
      
      // Guard against missing DSN for postgres
      if (srv.name === 'postgres') {
        const hasDsnArg = (srv.args ?? []).some(a => a === '--dsn' || a.startsWith('--dsn='));
        const envDsn = (srv.env?.DATABASE_URL || srv.env?.DATABASE_URI || '').trim();
        if (!hasDsnArg && !envDsn) {
          this.logger.warn({ server: 'postgres' }, 'Skipping postgres MCP: no DSN provided (DATABASE_URL/URI or --dsn).');
          return;
        }
      }
      
      // Substitute environment variables in env values
      const substitutedEnv = this.substituteEnvVars(srv.env ?? {});
      
      // Prevent parent PORT from influencing child servers (especially google-workspace)
      const baseEnv: Record<string, string> = { ...process.env } as Record<string, string>;
      if (srv.name === 'google-workspace') {
        delete baseEnv.PORT;
      }
      
      transport = new StdioClientTransport({
        command: srv.command,
        args: srv.args ?? [],
        env: { ...baseEnv, ...substitutedEnv } as Record<string, string>
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
    // Keep it simple and collision-safe, convert hyphens to underscores for OpenAI compatibility
    const normalizedServer = server.replace(/-/g, '_');
    return `mcp__${normalizedServer}__${tool}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
  }

  private fromOpenAiFunctionName(fn: string): { server: string; tool: string } {
    if (!fn.startsWith('mcp__')) throw new Error(`Not an MCP function: ${fn}`);
    const parts = fn.split('__');
    if (parts.length < 3) throw new Error(`Malformed MCP function name: ${fn}`);
    // Re-join any remaining underscores for tool name
    // Convert underscores back to hyphens for server name lookup
    const server = parts[1]!.replace(/_/g, '-');
    const tool = parts.slice(2).join('__');
    return { server, tool };
  }
}
