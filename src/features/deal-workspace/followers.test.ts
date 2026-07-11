// Integration tests for followDeal / unfollowDeal. Real Postgres, no DB mocking.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { dealFollowers, deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { listChangeLog } from "@/features/collaboration/changeLog";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { followDeal, unfollowDeal } from "./followers";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

function regularActor(userId: string): PermSetUser {
  return { id: userId, type: "regular", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function seedDeal(
  pipelineId: string,
  stageId: string,
  ownerId: string,
  visibilityLevel: "all" | "owner" = "all",
) {
  const [deal] = await h.db
    .insert(deals)
    .values({ title: "Deal", pipelineId, stageId, ownerId, visibilityLevel })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");
  return deal;
}

async function followerRows(dealId: string, userId: string) {
  return h.db
    .select()
    .from(dealFollowers)
    .where(and(eq(dealFollowers.dealId, dealId), eq(dealFollowers.userId, userId)));
}

it("followDeal inserts a self follower row; double-follow is an idempotent no-op", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);
  const actor = regularActor(u.id);
  const signal = new AbortController().signal;

  const first = await followDeal(h.db, actor, deal.id, signal);
  expect(first.ok).toBe(true);
  expect((await followerRows(deal.id, u.id)).length).toBe(1);

  const second = await followDeal(h.db, actor, deal.id, signal);
  expect(second.ok).toBe(true);
  expect((await followerRows(deal.id, u.id)).length).toBe(1);
});

it("unfollowDeal removes the row; unfollow-when-absent is a no-op", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);
  const actor = regularActor(u.id);
  const signal = new AbortController().signal;

  await followDeal(h.db, actor, deal.id, signal);
  const removed = await unfollowDeal(h.db, actor, deal.id, signal);
  expect(removed.ok).toBe(true);
  expect((await followerRows(deal.id, u.id)).length).toBe(0);

  const again = await unfollowDeal(h.db, actor, deal.id, signal);
  expect(again.ok).toBe(true);
  expect((await followerRows(deal.id, u.id)).length).toBe(0);
});

it("logs a follower add once, then a remove; idempotent repeats write nothing", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id);
  const actor = regularActor(u.id);
  const signal = new AbortController().signal;

  // First follow logs; the idempotent second follow (conflict no-op) logs nothing.
  await followDeal(h.db, actor, deal.id, signal);
  await followDeal(h.db, actor, deal.id, signal);

  // Unfollow logs; the unfollow-when-absent second call logs nothing.
  await unfollowDeal(h.db, actor, deal.id, signal);
  await unfollowDeal(h.db, actor, deal.id, signal);

  const rows = (await listChangeLog(h.db, "deal", deal.id, signal)).filter(
    (c) => c.field === "follower",
  );
  expect(rows.length).toBe(2);
  // Newest-first: unfollow (id -> null) then follow (null -> id).
  expect(rows[0]?.oldValue).toBe(u.id);
  expect(rows[0]?.newValue).toBeNull();
  expect(rows[1]?.oldValue).toBeNull();
  expect(rows[1]?.newValue).toBe(u.id);
  expect(rows[1]?.actorId).toBe(u.id);
});

it("returns a visibility error and inserts no row when the actor cannot see the deal", async () => {
  const owner = await seedUser(h.db);
  const stranger = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  // owner-level visibility: a non-owner regular actor cannot see it.
  const deal = await seedDeal(p.pipeline.id, p.stages[0]!.id, owner.id, "owner");

  const r = await followDeal(
    h.db,
    regularActor(stranger.id),
    deal.id,
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_DEAL_001");
  expect((await followerRows(deal.id, stranger.id)).length).toBe(0);
});
