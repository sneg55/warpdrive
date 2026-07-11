// Integration tests for markWon / markLost. Real Postgres via Testcontainers.
// No database mocking: mock/prod divergence hides broken queries (see CLAUDE.md).
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { dealFollowers, deals, lostReasons, notifications } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { notifyOnDealUpdate } from "@/features/deals/notifyHelpers";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { markLost, markWon } from "./wonLost";

// Single shared container across all tests in this file (fastest, still isolated).
let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

// Build an admin PermSetUser for a given db user row. Admin bypass lets us focus
// the tests on won/lost logic rather than on permission-flag wiring.
function makeActor(userId: string): PermSetUser {
  return {
    id: userId,
    type: "admin",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
  };
}

it("markWon: sets status=won and stamps wonTime", async () => {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Test Deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  const actor = makeActor(user.id);
  const signal = new AbortController().signal;

  const r = await markWon(h.db, actor, deal.id, signal);

  expect(r.ok).toBe(true);
  if (r.ok === true) {
    expect(r.value.status).toBe("won");
    expect(r.value.wonTime).not.toBeNull();
    expect(r.value.lostTime).toBeNull();
    expect(r.value.lostReasonId).toBeNull();
  }
});

it("markLost: rejects an invalid/nonexistent lostReasonId with E_DEAL_005", async () => {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Test Deal Lost Bad",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  const actor = makeActor(user.id);
  const signal = new AbortController().signal;

  const bad = await markLost(
    h.db,
    actor,
    deal.id,
    { lostReasonId: crypto.randomUUID(), lostReason: null },
    signal,
  );

  expect(bad.ok).toBe(false);
  if (bad.ok === false) {
    expect(bad.error.id).toBe(ERROR_IDS.DEAL_LOST_REASON_INVALID);
  }
});

it("markLost: sets status=lost, lostTime, and lostReasonId for a valid reason", async () => {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Test Deal Lost Good",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  // Select one of the seeded default lost reasons.
  const [reason] = await h.db.select().from(lostReasons).limit(1);
  if (reason === undefined)
    throw new Error("no seeded lost_reasons found - migration may not have run");

  const actor = makeActor(user.id);
  const signal = new AbortController().signal;

  const good = await markLost(
    h.db,
    actor,
    deal.id,
    { lostReasonId: reason.id, lostReason: null },
    signal,
  );

  expect(good.ok).toBe(true);
  if (good.ok === true) {
    expect(good.value.status).toBe("lost");
    expect(good.value.lostTime).not.toBeNull();
    expect(good.value.wonTime).toBeNull();
    expect(good.value.lostReasonId).toBe(reason.id);
  }
});

it("markLost accepts a free-text reason when no predefined reason is given", async () => {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Test Deal Lost Free Text",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  const actor = makeActor(user.id);
  const signal = new AbortController().signal;

  const r = await markLost(
    h.db,
    actor,
    deal.id,
    { lostReasonId: null, lostReason: "Budget cut" },
    signal,
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value.status).toBe("lost");
  expect(r.value.lostReason).toBe("Budget cut");
  expect(r.value.lostReasonId).toBeNull();
});

it("markLost succeeds with no reason at all", async () => {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Test Deal Lost No Reason",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  const actor = makeActor(user.id);
  const signal = new AbortController().signal;

  const r = await markLost(h.db, actor, deal.id, { lostReasonId: null, lostReason: null }, signal);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value.status).toBe("lost");
  expect(r.value.lostReasonId).toBeNull();
  expect(r.value.lostReason).toBeNull();
});

it("markWon: a non-owner follower receives a deal_won notification", async () => {
  // Mirrors markWonAction: markWon then notifyOnDealUpdate. Actor is the owner, so the
  // fan-out targets the (non-owner) follower.
  const owner = await seedUser(h.db);
  const follower = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Followed Deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: owner.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  await h.db.insert(dealFollowers).values({ dealId: deal.id, userId: follower.id });

  const actor = makeActor(owner.id);
  const signal = new AbortController().signal;

  const won = await markWon(h.db, actor, deal.id, signal);
  expect(won.ok).toBe(true);
  if (won.ok === false) return;

  await notifyOnDealUpdate(h.db, {
    deal: won.value,
    input: { status: "won" },
    actorId: owner.id,
    signal,
  });

  const rows = await h.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, follower.id), eq(notifications.type, "deal_won")));
  expect(rows.length).toBe(1);
  expect(rows[0]?.entityId).toBe(deal.id);
});
