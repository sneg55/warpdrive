// Integration tests for mergeDeals (merge source S into target T). Real Postgres, no DB mocking.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import {
  activities,
  activityTypes,
  changeLogs,
  dealFollowers,
  dealParticipants,
  deals,
  emailAccounts,
  emailThreads,
  notes,
} from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { mergeDeals } from "./mergeDeals";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

function actor(userId: string, flags: Iterable<PermissionFlagKey>): PermSetUser {
  return {
    id: userId,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(flags),
  };
}

async function seedDeal(pipelineId: string, stageId: string, ownerId: string, title: string) {
  const [deal] = await h.db
    .insert(deals)
    .values({ title, pipelineId, stageId, ownerId, visibilityLevel: "all" })
    .returning();
  if (deal === undefined) throw new Error("deal insert undefined");
  return deal;
}

function uniq(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

it("re-parents S's children to T, dedups followers, soft-deletes S, and logs the merge on T", async () => {
  const u = await seedUser(h.db);
  const other = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A", "B"]);
  const target = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id, "Target");
  const source = await seedDeal(p.pipeline.id, p.stages[1]!.id, u.id, "Source");

  // Child rows on the source.
  const [type] = await h.db
    .insert(activityTypes)
    .values({ key: uniq("call"), name: "Call" })
    .returning();
  const [act] = await h.db
    .insert(activities)
    .values({
      typeId: type!.id,
      subject: "Ring",
      ownerId: u.id,
      assigneeId: u.id,
      dealId: source.id,
    })
    .returning();
  const [note] = await h.db
    .insert(notes)
    .values({ entityType: "deal", entityId: source.id, body: "note on source", authorId: u.id })
    .returning();
  const [acct] = await h.db
    .insert(emailAccounts)
    .values({ userId: u.id, emailAddress: `${uniq("mb")}@example.com` })
    .returning();
  const [thread] = await h.db
    .insert(emailThreads)
    .values({ gmailThreadId: uniq("gt"), accountId: acct!.id, dealId: source.id })
    .returning();
  const personId = randomUUID();
  await h.db.insert(dealParticipants).values({ dealId: source.id, personId });
  // A follower shared between T and S (dedup target) + a follower unique to S.
  await h.db.insert(dealFollowers).values([
    { dealId: target.id, userId: u.id },
    { dealId: source.id, userId: u.id },
    { dealId: source.id, userId: other.id },
  ]);

  const r = await mergeDeals(
    h.db,
    actor(u.id, ["deal.edit_own"]),
    {
      targetDealId: target.id,
      sourceDealId: source.id,
      expectedTargetUpdatedAt: target.updatedAt.toISOString(),
      expectedSourceUpdatedAt: source.updatedAt.toISOString(),
    },
    new AbortController().signal,
  );

  expect(r.ok).toBe(true);
  if (r.ok === false) return;

  // Children re-parented to T.
  const [movedAct] = await h.db.select().from(activities).where(eq(activities.id, act!.id));
  expect(movedAct?.dealId).toBe(target.id);
  const [movedNote] = await h.db.select().from(notes).where(eq(notes.id, note!.id));
  expect(movedNote?.entityId).toBe(target.id);
  const [movedThread] = await h.db
    .select()
    .from(emailThreads)
    .where(eq(emailThreads.id, thread!.id));
  expect(movedThread?.dealId).toBe(target.id);
  const parts = await h.db
    .select()
    .from(dealParticipants)
    .where(eq(dealParticipants.dealId, target.id));
  expect(parts.map((x) => x.personId)).toContain(personId);
  // No participant rows left on S.
  const sParts = await h.db
    .select()
    .from(dealParticipants)
    .where(eq(dealParticipants.dealId, source.id));
  expect(sParts.length).toBe(0);

  // Followers: exactly one row per user on T (shared user deduped, no PK collision), S has none.
  const tFollowers = await h.db
    .select()
    .from(dealFollowers)
    .where(eq(dealFollowers.dealId, target.id));
  const userIds = tFollowers.map((f) => f.userId).sort();
  expect(userIds).toEqual([u.id, other.id].sort());
  const sFollowers = await h.db
    .select()
    .from(dealFollowers)
    .where(eq(dealFollowers.dealId, source.id));
  expect(sFollowers.length).toBe(0);

  // T survives, S soft-deleted.
  const [t] = await h.db.select().from(deals).where(eq(deals.id, target.id));
  expect(t?.deletedAt).toBeNull();
  const [s] = await h.db.select().from(deals).where(eq(deals.id, source.id));
  expect(s?.deletedAt).not.toBeNull();

  // Merge changelog entry on T referencing S.
  const log = await h.db
    .select()
    .from(changeLogs)
    .where(and(eq(changeLogs.entityId, target.id), eq(changeLogs.field, "mergedDealId")));
  expect(log.length).toBe(1);
});

it("rejects merging a deal into itself (E_DEAL_010)", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A"]);
  const d = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id, "Self");

  const r = await mergeDeals(
    h.db,
    actor(u.id, ["deal.edit_own"]),
    {
      targetDealId: d.id,
      sourceDealId: d.id,
      expectedTargetUpdatedAt: d.updatedAt.toISOString(),
      expectedSourceUpdatedAt: d.updatedAt.toISOString(),
    },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_DEAL_010");
});

it("denies when the actor cannot edit one of the deals (E_PERM_001)", async () => {
  const u = await seedUser(h.db);
  const stranger = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A", "B"]);
  const target = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id, "T");
  // Source owned by someone else; the actor has only edit_own so cannot edit it.
  const source = await seedDeal(p.pipeline.id, p.stages[1]!.id, stranger.id, "S");

  const r = await mergeDeals(
    h.db,
    actor(u.id, ["deal.edit_own"]),
    {
      targetDealId: target.id,
      sourceDealId: source.id,
      expectedTargetUpdatedAt: target.updatedAt.toISOString(),
      expectedSourceUpdatedAt: source.updatedAt.toISOString(),
    },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_PERM_001");

  const [s] = await h.db.select().from(deals).where(eq(deals.id, source.id));
  expect(s?.deletedAt).toBeNull();
});

it("returns E_DEAL_002 on a stale CAS and leaves both deals intact", async () => {
  const u = await seedUser(h.db);
  const p = await seedPipelineWithStages(h.db, ["A", "B"]);
  const target = await seedDeal(p.pipeline.id, p.stages[0]!.id, u.id, "T");
  const source = await seedDeal(p.pipeline.id, p.stages[1]!.id, u.id, "S");

  const r = await mergeDeals(
    h.db,
    actor(u.id, ["deal.edit_own"]),
    {
      targetDealId: target.id,
      sourceDealId: source.id,
      expectedTargetUpdatedAt: target.updatedAt.toISOString(),
      expectedSourceUpdatedAt: new Date(Date.now() - 60_000).toISOString(),
    },
    new AbortController().signal,
  );

  expect(r.ok).toBe(false);
  if (r.ok === true) return;
  expect(r.error.id).toBe("E_DEAL_002");

  const [s] = await h.db.select().from(deals).where(eq(deals.id, source.id));
  expect(s?.deletedAt).toBeNull();
});
