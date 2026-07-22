import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "@/db/client";
import { registerReadTools } from "./tools/reads";
import type { GetCtx } from "./tools/types";
import { registerWriteTools } from "./tools/writes";

const registeredNames = new WeakMap<McpServer, ReadonlySet<string>>();

export function registerMcpTools(server: McpServer, getCtx: GetCtx, db: Db): void {
  const reads = registerReadTools(server, getCtx);
  const writes = registerWriteTools(server, getCtx, db);
  registeredNames.set(server, new Set([...reads.names, ...writes.names]));
}

export function buildMcpServer(getCtx: GetCtx, db: Db): McpServer {
  const server = new McpServer({ name: "warpdrive", version: "1.0.0" });
  registerMcpTools(server, getCtx, db);
  return server;
}

export function listToolNames(server: McpServer): string[] {
  return Array.from(registeredNames.get(server) ?? []).sort();
}
