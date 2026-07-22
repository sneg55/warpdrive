import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "@/db/client";
import { createDeal, moveDeal, updateDeal } from "@/features/deals/dealActions";
import { dealCreateInput, dealMoveInput, dealUpdateInput } from "@/features/deals/schemas";
import { createLead } from "@/features/leads/leadActions";
import { convertLead } from "@/features/leads/leadConvert";
import { updateLead } from "@/features/leads/leadUpdate";
import { convertLeadInput, leadCreateInput, leadUpdateInput } from "@/features/leads/schemas";
import { buildEntityCreateSession, toPermSetUser } from "@/features/mcp/actorContext";
import {
  type GetCtx,
  getToolActor,
  registerTool,
  resultToTool,
  type ToolRegistry,
  toolError,
} from "./types";

export function registerDealWriteTools(
  server: McpServer,
  registry: ToolRegistry,
  getCtx: GetCtx,
  db: Db,
): void {
  registerTool(server, registry, {
    name: "create_deal",
    description: "Create a deal",
    inputSchema: dealCreateInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      const session = await buildEntityCreateSession(db, actor.value, signal);
      return resultToTool(await createDeal(db, session, input, signal));
    },
  });
  registerTool(server, registry, {
    name: "update_deal",
    description: "Update a deal",
    inputSchema: dealUpdateInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      return resultToTool(await updateDeal(db, toPermSetUser(actor.value), input, signal));
    },
  });
  registerTool(server, registry, {
    name: "move_deal_stage",
    description: "Move a deal to another stage",
    inputSchema: dealMoveInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      return resultToTool(await moveDeal(db, toPermSetUser(actor.value), input, signal));
    },
  });
  registerTool(server, registry, {
    name: "create_lead",
    description: "Create a lead",
    inputSchema: leadCreateInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      const session = await buildEntityCreateSession(db, actor.value, signal);
      return resultToTool(await createLead(db, session, input, signal));
    },
  });
  registerTool(server, registry, {
    name: "update_lead",
    description: "Update a lead",
    inputSchema: leadUpdateInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      const session = await buildEntityCreateSession(db, actor.value, signal);
      return resultToTool(await updateLead(db, session, input, signal));
    },
  });
  registerTool(server, registry, {
    name: "convert_lead_to_deal",
    description: "Convert a lead to a deal",
    inputSchema: convertLeadInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      const session = await buildEntityCreateSession(db, actor.value, signal);
      return resultToTool(await convertLead(db, session, input, signal));
    },
  });
}
