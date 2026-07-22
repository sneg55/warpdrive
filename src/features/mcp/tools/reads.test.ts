import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expect, test } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { hydrateActor } from "@/server/hydrateActor";
import { registerReadTools } from "./reads";

test("read tools return visible deals and search results", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const seeded = await seedPipelineWithStages(db, ["Open"]);
    const [deal] = await db
      .insert(deals)
      .values({
        title: "MCP Read Deal",
        pipelineId: seeded.pipeline.id,
        stageId: seeded.stages[0]!.id,
        ownerId: user.id,
        visibilityLevel: "owner",
      })
      .returning();
    expect(deal).toBeDefined();

    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    expect(actor).not.toBeNull();
    if (actor === null) return;

    const server = new McpServer({ name: "read-tools-test", version: "1.0.0" });
    const tools = registerReadTools(server, () => buildAppContext(db, actor));

    const listed = await tools.invoke("list_deals", {});
    expect(listed.isError).not.toBe(true);
    expect(listed.content[0]?.type).toBe("text");
    if (listed.content[0]?.type === "text") {
      expect(listed.content[0].text).toContain("MCP Read Deal");
    }

    const searched = await tools.invoke("search", { q: "MCP Read Deal" });
    expect(searched.isError).not.toBe(true);
  });
});
