import { z } from 'zod';

export const McpServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(['stdio', 'http']),
  // stdio transport
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  // http transport
  url: z.string().url().optional()
});

export const McpServersFileSchema = z.array(McpServerConfigSchema);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpServersFile = z.infer<typeof McpServersFileSchema>;
