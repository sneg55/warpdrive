import { expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { hydrateActor } from "@/server/hydrateActor";
import { buildMcpServer, listToolNames } from "./server";

const EXPECTED_TOOLS = [
  "search",
  "list_deals",
  "get_deal",
  "list_leads",
  "get_lead",
  "list_persons",
  "get_person",
  "list_organizations",
  "get_organization",
  "list_activities",
  "get_activity",
  "list_pipelines",
  "get_pipeline",
  "pipeline_summary",
  "create_deal",
  "update_deal",
  "move_deal_stage",
  "create_lead",
  "update_lead",
  "convert_lead_to_deal",
  "create_person",
  "update_person",
  "create_organization",
  "update_organization",
  "create_activity",
  "update_activity",
  "complete_activity",
  "add_note",
] as const;

test("MCP server exposes the complete tool set without destructive tools", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    expect(actor).not.toBeNull();
    if (actor === null) return;

    const server = buildMcpServer(() => buildAppContext(db, actor), db);
    const names = listToolNames(server);

    expect(names).toEqual(expect.arrayContaining([...EXPECTED_TOOLS]));
    expect(names).toHaveLength(EXPECTED_TOOLS.length);
    expect(names.some((name) => /delete|remove|archive|destroy/i.test(name))).toBe(false);
  });
});
