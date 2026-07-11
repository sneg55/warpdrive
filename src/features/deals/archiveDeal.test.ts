import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { wsChannel } from "@/constants/wsChannels";
import { changeLogs, channelVersions, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { archiveDeal } from "./archiveDeal";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

function actor(id: string): PermSetUser {
  return { id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function seedDeal(ownerId: string) {
  const { pipeline, stages } = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [d] = await h.db
    .insert(deals)
    .values({
      title: "Acme",
      pipelineId: pipeline.id,
      stageId: stages[0]!.id,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  if (d === undefined) throw new Error("deal insert returned undefined");
  return d;
}

async function readDeal(dealId: string) {
  const [row] = await h.db.select().from(deals).where(eq(deals.id, dealId));
  if (row === undefined) throw new Error("deal vanished");
  return row;
}

it("archiving keeps status and sets archived_at", async () => {
  const u = await seedUser(h.db);
  const d = await seedDeal(u.id);
  const r = await archiveDeal(h.db, actor(u.id), { dealId: d.id, archived: true }, sig());
  expect(r.ok).toBe(true);
  const row = await readDeal(d.id);
  expect(row.status).toBe("open");
  expect(row.archivedAt).not.toBeNull();
});

it("unarchiving clears archived_at", async () => {
  const u = await seedUser(h.db);
  const d = await seedDeal(u.id);
  await archiveDeal(h.db, actor(u.id), { dealId: d.id, archived: true }, sig());
  await archiveDeal(h.db, actor(u.id), { dealId: d.id, archived: false }, sig());
  const row = await readDeal(d.id);
  expect(row.archivedAt).toBeNull();
});

it("records an 'archived' changelog entry with actor and old/new values", async () => {
  const u = await seedUser(h.db);
  const d = await seedDeal(u.id);
  await archiveDeal(h.db, actor(u.id), { dealId: d.id, archived: true }, sig());
  const [log] = await h.db
    .select()
    .from(changeLogs)
    .where(and(eq(changeLogs.entityId, d.id), eq(changeLogs.field, "archived")));
  if (log === undefined) throw new Error("no archived changelog row");
  expect(log.actorId).toBe(u.id);
  expect(log.oldValue).toBe(false);
  expect(log.newValue).toBe(true);
});

it("publishes a board event on the pipeline channel on archive", async () => {
  const u = await seedUser(h.db);
  const d = await seedDeal(u.id);
  const r = await archiveDeal(h.db, actor(u.id), { dealId: d.id, archived: true }, sig());
  expect(r.ok).toBe(true);

  const rows = await h.db
    .select()
    .from(channelVersions)
    .where(eq(channelVersions.channel, wsChannel.pipeline(d.pipelineId)));
  expect(rows[0]).toBeDefined();
  expect(Number(rows[0]?.version ?? 0)).toBeGreaterThanOrEqual(1);
});
