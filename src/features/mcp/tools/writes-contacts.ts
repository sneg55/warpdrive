import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "@/db/client";
import { createOrg, updateOrg } from "@/features/contacts/orgsRepo";
import { createPerson, updatePerson } from "@/features/contacts/personsRepo";
import {
  orgCreateInput,
  orgUpdateInput,
  personCreateInput,
  personUpdateInput,
} from "@/features/contacts/schemas";
import { buildContactActor } from "@/features/mcp/actorContext";
import {
  type GetCtx,
  getToolActor,
  registerTool,
  resultToTool,
  type ToolRegistry,
  toolError,
} from "./types";

export function registerContactWriteTools(
  server: McpServer,
  registry: ToolRegistry,
  getCtx: GetCtx,
  db: Db,
): void {
  registerTool(server, registry, {
    name: "create_person",
    description: "Create a person",
    inputSchema: personCreateInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      return resultToTool(
        await createPerson(db, await buildContactActor(db, actor.value, signal), input, signal),
      );
    },
  });
  registerTool(server, registry, {
    name: "update_person",
    description: "Update a person",
    inputSchema: personUpdateInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      return resultToTool(
        await updatePerson(db, await buildContactActor(db, actor.value, signal), input, signal),
      );
    },
  });
  registerTool(server, registry, {
    name: "create_organization",
    description: "Create an organization",
    inputSchema: orgCreateInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      return resultToTool(
        await createOrg(db, await buildContactActor(db, actor.value, signal), input, signal),
      );
    },
  });
  registerTool(server, registry, {
    name: "update_organization",
    description: "Update an organization",
    inputSchema: orgUpdateInput,
    run: async (input, signal) => {
      const actor = getToolActor(getCtx);
      if (!actor.ok) return toolError(actor.error);
      return resultToTool(
        await updateOrg(db, await buildContactActor(db, actor.value, signal), input, signal),
      );
    },
  });
}
