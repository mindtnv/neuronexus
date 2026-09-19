import type { z } from 'zod';
import type { ToolContext } from '../ai/tools.ts';

export class McpToolError extends Error {}
export type McpArgs = Record<string, unknown>;
export interface KnowledgeTool {
  name: string;
  description: string;
  schema: z.ZodType;
  readOnly: boolean;
  destructive?: boolean;
  prepare?: (ctx: ToolContext, args: McpArgs) => Promise<Record<string, unknown>>;
  execute: (ctx: ToolContext, args: McpArgs) => Promise<unknown>;
  afterCommit?: (ctx: ToolContext, args: McpArgs, result: unknown) => void;
}
