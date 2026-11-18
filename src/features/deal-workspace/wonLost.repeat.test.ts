import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { CHANGE_FIELD_STATUS } from "@/constants/changeLogFields";
import { type Deal, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { listChangeLog } from "@/features/collaboration/changeLog";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { markLost, markWon } from "./wonLost";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = (): AbortSignal => new AbortController().signal;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

async function seedDeal(): Promise<{ dealId: string; actor: PermSetUser }> {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const stage = pipe.stages[0];
  if (stage === undefined) throw new Error("stage seed failed");
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Repeat close",
      pipelineId: pipe.pipeline.id,
      stageId: stage.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");
  const actor: PermSetUser = {
    id: user.id,
    type: "admin",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
  return { dealId: deal.id, actor };
}

async function readDeal(dealId: string): Promise<Deal> {
  const [row] = await h.db.select().from(deals).where(eq(deals.id, dealId));
  if (row === undefined) throw new Error("deal vanished");
  return row;
}

async function statusLogCount(dealId: string): Promise<number> {
  const log = await listChangeLog(h.db, "deal", dealId, sig());
  return log.filter((e) => e.field === CHANGE_FIELD_STATUS).length;
}

it("a repeated Won keeps the first won time and logs one status change", async () => {
  const { dealId, actor } = await seedDeal();
  await markWon(h.db, actor, dealId, sig());
  const first = await readDeal(dealId);

  const again = await markWon(h.db, actor, dealId, sig());

  expect(again.ok).toBe(true);
  const second = await readDeal(dealId);
  expect(second.wonTime?.toISOString()).toBe(first.wonTime?.toISOString());
  expect(second.updatedAt.toISOString()).toBe(first.updatedAt.toISOString());
  expect(await statusLogCount(dealId)).toBe(1);
});

it("a repeated Lost keeps the first lost time, reason, and one status change", async () => {
  const { dealId, actor } = await seedDeal();
  await markLost(h.db, actor, dealId, { lostReasonId: null, lostReason: "Budget cut" }, sig());
  const first = await readDeal(dealId);

  const again = await markLost(
    h.db,
    actor,
    dealId,
    { lostReasonId: null, lostReason: "Budget cut" },
    sig(),
  );

  expect(again.ok).toBe(true);
  const second = await readDeal(dealId);
  expect(second.lostTime?.toISOString()).toBe(first.lostTime?.toISOString());
  expect(second.updatedAt.toISOString()).toBe(first.updatedAt.toISOString());
  expect(second.lostReason).toBe("Budget cut");
  expect(await statusLogCount(dealId)).toBe(1);
});
