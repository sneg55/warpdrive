import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "@/db/client";
import { registerReadTools } from "./tools/reads";
import type { GetCtx } from "./tools/types";
import { registerWriteTools } from "./tools/writes";

export function registerMcpTools(server: McpServer, getCtx: GetCtx, db: Db): void {
  registerReadTools(server, getCtx);
  registerWriteTools(server, getCtx, db);
}

export function buildMcpServer(getCtx: GetCtx, db: Db): McpServer {
  const server = new McpServer({ name: "warpdrive", version: "1.0.0" });
  registerMcpTools(server, getCtx, db);
  return server;
}
