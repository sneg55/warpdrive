import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { deals, leads } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { hydrateActor } from "@/server/hydrateActor";
import { registerWriteTools } from "./writes";

test("create_deal writes a deal for an admin actor", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const seeded = await seedPipelineWithStages(db, ["Open"]);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    expect(actor).not.toBeNull();
    if (actor === null) return;

    const server = new McpServer({ name: "write-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("create_deal", {
      title: "MCP Created Deal",
      pipelineId: seeded.pipeline.id,
      stageId: seeded.stages[0]!.id,
    });

    expect(result.isError).not.toBe(true);
    const rows = await db.select().from(deals).where(eq(deals.title, "MCP Created Deal"));
    expect(rows).toHaveLength(1);
  });
});

test("create_deal returns the permission error for a regular actor", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const seeded = await seedPipelineWithStages(db, ["Open"]);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    expect(actor).not.toBeNull();
    if (actor === null) return;

    const server = new McpServer({ name: "write-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("create_deal", {
      title: "Denied MCP Deal",
      pipelineId: seeded.pipeline.id,
      stageId: seeded.stages[0]!.id,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain(ERROR_IDS.PERM_DENIED);
    }
  });
});

test("archive_lead moves a visible lead out of the inbox and back", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    expect(actor).not.toBeNull();
    if (actor === null) return;

    const [lead] = await db
      .insert(leads)
      .values({ title: "Stranded lead", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    expect(lead).toBeDefined();
    if (lead === undefined) return;

    const server = new McpServer({ name: "write-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);

    const archived = await tools.invoke("archive_lead", { leadId: lead.id });
    expect(archived.isError).not.toBe(true);
    const [afterArchive] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(afterArchive?.archivedAt).not.toBeNull();

    const restored = await tools.invoke("archive_lead", { leadId: lead.id, archived: false });
    expect(restored.isError).not.toBe(true);
    const [afterRestore] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(afterRestore?.archivedAt).toBeNull();
  });
});

test("archive_lead returns not-found for a lead the actor cannot see", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const actor = await hydrateActor(db, other.id, AbortSignal.timeout(5_000));
    expect(actor).not.toBeNull();
    if (actor === null) return;

    const [lead] = await db
      .insert(leads)
      .values({ title: "Someone else's lead", ownerId: owner.id, visibilityLevel: "owner" })
      .returning();
    if (lead === undefined) return;

    const server = new McpServer({ name: "write-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);

    const result = await tools.invoke("archive_lead", { leadId: lead.id });
    expect(result.isError).toBe(true);
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain(ERROR_IDS.LEAD_NOT_FOUND);
    }
  });
});
