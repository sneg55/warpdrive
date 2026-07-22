import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "@/db/client";
import { type GetCtx, ToolRegistry } from "./types";
import { registerActivityWriteTools } from "./writes-activities";
import { registerContactWriteTools } from "./writes-contacts";
import { registerDealWriteTools } from "./writes-deals";

export function registerWriteTools(server: McpServer, getCtx: GetCtx, db: Db): ToolRegistry {
  const registry = new ToolRegistry();
  registerDealWriteTools(server, registry, getCtx, db);
  registerContactWriteTools(server, registry, getCtx, db);
  registerActivityWriteTools(server, registry, getCtx, db);
  return registry;
}
