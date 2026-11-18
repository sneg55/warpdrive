import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { hydrateActor } from "@/server/hydrateActor";
import { buildMcpServer } from "./server";

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
  "archive_lead",
  "create_person",
  "update_person",
  "create_organization",
  "update_organization",
  "create_activity",
  "update_activity",
  "complete_activity",
  "add_note",
  "list_emails",
  "get_email",
  "list_email_drafts",
  "list_mailboxes",
  "create_email_draft",
  "update_email_draft",
  "delete_email_draft",
] as const;

test("tools/list serves the complete tool set over the wire, JSON-Schema representable, without destructive tools", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    expect(actor).not.toBeNull();
    if (actor === null) return;

    const server = buildMcpServer(() => buildAppContext(db, actor), db);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const listed = await client.listTools();
      const names = listed.tools.map((t) => t.name).sort();
      expect(names).toEqual([...EXPECTED_TOOLS].sort());
      const records = names.filter((name) => !name.endsWith("_email_draft"));
      expect(records.some((name) => /delete|remove|destroy/i.test(name))).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
