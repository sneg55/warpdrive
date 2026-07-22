import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { activityListFilter, activitySortInput } from "@/features/activities/schemas";
import { orgFilterSchema, personFilterSchema } from "@/features/contacts/contactFilter";
import { orgSortInput, personSortInput } from "@/features/contacts/schemas";
import { getWorkspace } from "@/features/deal-workspace/summaryRepo";
import { leadByIdInput, leadListInput } from "@/features/leads/schemas";
import { toAuthUser } from "@/features/mcp/actorContext";
import { filterDefinition } from "@/features/saved-filters/schemas";
import { searchInput } from "@/features/search/schemas";
import { dashboardInput } from "@/features/stats/schemas";
import { createCaller } from "@/server/trpc/root";
import { type GetCtx, registerTool, ToolRegistry, toolError, toolResult } from "./types";

const idInput = z.object({ id: z.string().uuid() });
const emptyInput = z.object({});
const dealListInput = z.object({
  pipelineId: z.string().uuid().optional(),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(50),
  archived: z.boolean().optional(),
  definition: filterDefinition.optional(),
});
const personListInput = z.object({
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(50),
  sort: personSortInput.optional(),
  filter: personFilterSchema.optional(),
});
const organizationListInput = z.object({
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(50),
  sort: orgSortInput.optional(),
  filter: orgFilterSchema.optional(),
});
const activityListInput = activityListFilter.extend({ sort: activitySortInput.optional() });

export function registerReadTools(server: McpServer, getCtx: GetCtx): ToolRegistry {
  const registry = new ToolRegistry();
  const caller = () => createCaller(getCtx());

  registerTool(server, registry, {
    name: "search",
    description: "Search visible CRM records",
    inputSchema: searchInput,
    run: async (input) => toolResult(await caller().search.query(input)),
  });
  registerTool(server, registry, {
    name: "list_deals",
    description: "List visible deals",
    inputSchema: dealListInput,
    run: async (input) => toolResult(await caller().deal.list(input)),
  });
  registerTool(server, registry, {
    name: "get_deal",
    description: "Get one visible deal",
    inputSchema: idInput,
    run: async (input, signal) => {
      const ctx = getCtx();
      if (ctx.actor === null) {
        return toolError(
          new AppError(ERROR_IDS.OAUTH_TOKEN_REVOKED, "MCP actor is unavailable", {}),
        );
      }
      const result = await getWorkspace(ctx.db, toAuthUser(ctx.actor), input.id, signal);
      return result.ok ? toolResult(result.value) : toolError(result.error);
    },
  });
  registerTool(server, registry, {
    name: "list_leads",
    description: "List visible leads",
    inputSchema: leadListInput,
    run: async (input) => toolResult(await caller().lead.list(input)),
  });
  registerTool(server, registry, {
    name: "get_lead",
    description: "Get one visible lead",
    inputSchema: leadByIdInput,
    run: async (input) => toolResult(await caller().lead.byId(input)),
  });
  registerTool(server, registry, {
    name: "list_persons",
    description: "List visible people",
    inputSchema: personListInput,
    run: async (input) => toolResult(await caller().contacts.listPeople(input)),
  });
  registerTool(server, registry, {
    name: "get_person",
    description: "Get one visible person",
    inputSchema: idInput,
    run: async (input) => toolResult(await caller().contacts.getPerson(input)),
  });
  registerTool(server, registry, {
    name: "list_organizations",
    description: "List visible organizations",
    inputSchema: organizationListInput,
    run: async (input) => toolResult(await caller().contacts.listOrgs(input)),
  });
  registerTool(server, registry, {
    name: "get_organization",
    description: "Get one visible organization",
    inputSchema: idInput,
    run: async (input) => toolResult(await caller().contacts.getOrg(input)),
  });
  registerTool(server, registry, {
    name: "list_activities",
    description: "List visible activities",
    inputSchema: activityListInput,
    run: async (input) => toolResult(await caller().activities.listRows(input)),
  });
  registerTool(server, registry, {
    name: "get_activity",
    description: "Get one visible activity",
    inputSchema: idInput,
    run: async (input) => toolResult(await caller().activities.getForEdit(input)),
  });
  registerTool(server, registry, {
    name: "list_pipelines",
    description: "List visible pipelines and stages",
    inputSchema: emptyInput,
    run: async () => toolResult(await caller().pipeline.list()),
  });
  registerTool(server, registry, {
    name: "get_pipeline",
    description: "Get one visible pipeline and its stages",
    inputSchema: idInput,
    run: async (input) => toolResult(await caller().pipeline.byId(input.id)),
  });
  registerTool(server, registry, {
    name: "pipeline_summary",
    description: "Summarize pipeline performance",
    inputSchema: dashboardInput,
    run: async (input) => toolResult(await caller().stats.dashboard(input)),
  });
  return registry;
}
