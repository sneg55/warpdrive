import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  captureDealSearchQueue,
  linkedDeal,
} from "@/features/intercom/dealSearch/dealSearch.test-helpers";
import { buildAppContext } from "@/features/mcp/actorContext";
import { seedWorld } from "@/features/search/search.test-helpers";
import { hydrateActor } from "@/server/hydrateActor";
import { registerWriteTools } from "./writes";

const releases: Array<() => void> = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
});

async function toolsFor(db: Parameters<Parameters<typeof withTestDb>[0]>[0], userId: string) {
  const actor = await hydrateActor(db, userId, AbortSignal.timeout(5_000));
  if (actor === null) throw new Error("actor");
  const server = new McpServer({ name: "t", version: "1.0.0" });
  return registerWriteTools(server, () => buildAppContext(db, actor), db);
}

describe("MCP write tools queue a deal search refresh", () => {
  it("queues the deal when update_deal changes its person", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "b@acme.com");
      const [row] = await db.select().from(deals).where(eq(deals.id, a.dealId));
      const q = captureDealSearchQueue();
      releases.push(q.release);
      const tools = await toolsFor(db, admin.id);
      const r = await tools.invoke("update_deal", {
        dealId: a.dealId,
        expectedUpdatedAt: row?.updatedAt.toISOString(),
        personId: b.personId,
      });
      expect(r.isError).not.toBe(true);
      expect(q.queued()).toEqual([a.dealId]);
    });
  });

  it("queues the person's deals when update_person changes emails", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const q = captureDealSearchQueue();
      releases.push(q.release);
      const tools = await toolsFor(db, admin.id);
      const r = await tools.invoke("update_person", {
        id: a.personId,
        emails: [{ label: "work", value: "changed@acme.com", primary: true }],
      });
      expect(r.isError).not.toBe(true);
      expect(q.queued()).toEqual([a.dealId]);
    });
  });

  it("queues a deal created with a person", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const q = captureDealSearchQueue();
      releases.push(q.release);
      const tools = await toolsFor(db, admin.id);
      const r = await tools.invoke("create_deal", {
        title: "Via MCP",
        pipelineId: w.pipelineId,
        stageId: w.stageId,
        personId: a.personId,
      });
      expect(r.isError).not.toBe(true);
      expect(q.queued()).toHaveLength(1);
    });
  });
});
