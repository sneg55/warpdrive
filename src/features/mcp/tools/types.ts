import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { HydratedActor } from "@/server/hydrateActor";
import type { AppContext } from "@/server/trpc/context";
import { err, ok, type Result } from "@/types/result";

export type ToolCtx = AppContext;
export type GetCtx = () => ToolCtx;

type Invoke = (input: unknown, signal: AbortSignal) => Promise<CallToolResult>;

export class ToolRegistry {
  readonly names = new Set<string>();
  private readonly handlers = new Map<string, Invoke>();

  add(name: string, handler: Invoke): void {
    this.names.add(name);
    this.handlers.set(name, handler);
  }

  async invoke(name: string, input: unknown): Promise<CallToolResult> {
    const handler = this.handlers.get(name);
    if (handler === undefined) return toolError(`Unknown tool: ${name}`);
    return handler(input, AbortSignal.timeout(10_000));
  }
}

export function toolResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export function toolError(error: unknown): CallToolResult {
  let text = "Tool execution failed";
  if (error instanceof AppError) text = `${error.id}: ${error.message}`;
  else if (error instanceof TRPCError) {
    text =
      error.cause instanceof AppError ? `${error.cause.id}: ${error.cause.message}` : error.message;
  } else if (error instanceof z.ZodError) text = `Invalid tool input: ${error.message}`;
  return { isError: true, content: [{ type: "text", text }] };
}

export function resultToTool<T>(result: Result<T, AppError>): CallToolResult {
  return result.ok ? toolResult(result.value) : toolError(result.error);
}

export function getToolActor(getCtx: GetCtx): Result<HydratedActor, AppError> {
  const actor = getCtx().actor;
  if (actor !== null) return ok(actor);
  return err(new AppError(ERROR_IDS.OAUTH_TOKEN_REVOKED, "MCP actor is unavailable", {}));
}

export function registerTool<S extends z.ZodObject>(
  server: McpServer,
  registry: ToolRegistry,
  definition: {
    name: string;
    description: string;
    inputSchema: S;
    run: (input: z.output<S>, signal: AbortSignal) => Promise<CallToolResult>;
  },
): void {
  const invoke: Invoke = async (raw, signal) => {
    const parsed = definition.inputSchema.safeParse(raw);
    if (!parsed.success) return toolError(parsed.error);
    try {
      return await definition.run(parsed.data, signal);
    } catch (error) {
      return toolError(error);
    }
  };

  server.registerTool(
    definition.name,
    { description: definition.description, inputSchema: definition.inputSchema.shape },
    (input, extra) => invoke(input, AbortSignal.any([extra.signal, AbortSignal.timeout(15_000)])),
  );
  registry.add(definition.name, invoke);
}
