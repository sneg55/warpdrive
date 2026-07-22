import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema";
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
