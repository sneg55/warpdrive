import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { wsChannel } from "@/constants/wsChannels";
import { channelVersions, dealFollowers, deals, notifications } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { notifyOnDealUpdate } from "@/features/deals/notifyHelpers";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { reopenDeal } from "./wonLost";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

function makeActor(userId: string): PermSetUser {
  return { id: userId, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("reopenDeal: returns a won deal to open and clears wonTime", async () => {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Mis-clicked Won",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      status: "won",
      wonTime: new Date(),
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  const r = await reopenDeal(h.db, makeActor(user.id), deal.id, new AbortController().signal);
  expect(r.ok).toBe(true);
  if (r.ok === true) {
    expect(r.value.status).toBe("open");
    expect(r.value.wonTime).toBeNull();
    expect(r.value.lostTime).toBeNull();
    expect(r.value.lostReasonId).toBeNull();
  }
});

it("reopenDeal: a non-owner follower receives a deal_followed_update notification", async () => {
  const owner = await seedUser(h.db);
  const follower = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Reopened Followed Deal",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: owner.id,
      status: "won",
      wonTime: new Date(),
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  await h.db.insert(dealFollowers).values({ dealId: deal.id, userId: follower.id });

  const actor = makeActor(owner.id);
  const signal = new AbortController().signal;

  const reopened = await reopenDeal(h.db, actor, deal.id, signal);
  expect(reopened.ok).toBe(true);
  if (reopened.ok === false) return;

  await notifyOnDealUpdate(h.db, {
    deal: reopened.value,
    input: { status: "open" },
    actorId: owner.id,
    signal,
  });

  const rows = await h.db
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.userId, follower.id), eq(notifications.type, "deal_followed_update")),
    );
  expect(rows.length).toBe(1);
  expect(rows[0]?.entityId).toBe(deal.id);
});

it("reopenDeal: publishes on the pipeline channel so an open board refetches", async () => {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "Reopen Board Refetch",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      status: "won",
      wonTime: new Date(),
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");

  const r = await reopenDeal(h.db, makeActor(user.id), deal.id, new AbortController().signal);
  expect(r.ok).toBe(true);

  const channel = wsChannel.pipeline(pipe.pipeline.id);
  const versions = await h.db
    .select()
    .from(channelVersions)
    .where(eq(channelVersions.channel, channel));
  expect(versions[0]).toBeDefined();
  expect(Number(versions[0]?.version ?? 0)).toBeGreaterThanOrEqual(1);
});
