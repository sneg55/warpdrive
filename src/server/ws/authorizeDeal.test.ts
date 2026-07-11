import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  deals,
  pipelines,
  sessions,
  stages,
  users,
  visibilityGroupMembers,
  visibilityGroups,
} from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { authorizeSubscribe } from "./authorize";

// Deal-channel WS authorization tests. Split out of authorize.test.ts to keep each test
// file focused (and under the file-size limit): this file owns the deal:{id} subscribe rules.
let h: TestDb;
let userId: string;
let sessionId: string;
const SIG = () => AbortSignal.timeout(8000);

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.db.execute(
    sql`TRUNCATE ws_tickets, sessions, users, permission_sets, visibility_groups RESTART IDENTITY CASCADE`,
  );
  const [u] = await h.db
    .insert(users)
    .values({ email: "w@example.com", name: "W", googleSub: "g-w" })
    .returning();
  userId = u!.id;
  const [s] = await h.db
    .insert(sessions)
    .values({ userId, expiresAt: new Date(Date.now() + 3_600_000) })
    .returning();
  sessionId = s!.id;
});

// Helper: seed a pipeline + stage, return their ids.
async function seedPipelineStage(db: typeof h.db, opts?: { visibilityGroupId?: string }) {
  const [pipe] = await db
    .insert(pipelines)
    .values({ name: "Test pipeline", visibilityGroupId: opts?.visibilityGroupId ?? null })
    .returning();
  const pipelineId = pipe!.id;
  const [stage] = await db.insert(stages).values({ pipelineId, name: "Stage 1" }).returning();
  return { pipelineId, stageId: stage!.id };
}

// Helper: seed a deal owned by ownerId; returns deal id.
async function seedDeal(
  db: typeof h.db,
  opts: {
    pipelineId: string;
    stageId: string;
    ownerId: string;
    visibilityLevel: "owner" | "group" | "all";
    visibilityGroupId?: string;
    visibleToUserIds?: string[];
  },
) {
  const [deal] = await db
    .insert(deals)
    .values({
      title: "Deal",
      pipelineId: opts.pipelineId,
      stageId: opts.stageId,
      ownerId: opts.ownerId,
      visibilityLevel: opts.visibilityLevel,
      visibilityGroupId: opts.visibilityGroupId ?? null,
      visibleToUserIds: opts.visibleToUserIds ?? [],
    })
    .returning();
  return deal!.id;
}

describe("ws authorize deal channel", () => {
  test("deal: regular user who OWNS the deal can subscribe (was wrongly denied by Phase 1 stub)", async () => {
    const { pipelineId, stageId } = await seedPipelineStage(h.db);
    const dealId = await seedDeal(h.db, {
      pipelineId,
      stageId,
      ownerId: userId,
      visibilityLevel: "owner",
    });
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `deal:${dealId}`, SIG());
    expect(r.ok).toBe(true);
  });

  test("deal: regular user who is NOT owner/group/visible_to of an owner-visibility deal is denied", async () => {
    const [owner] = await h.db
      .insert(users)
      .values({ email: "owner@example.com", name: "Owner", googleSub: "g-owner" })
      .returning();
    const { pipelineId, stageId } = await seedPipelineStage(h.db);
    const dealId = await seedDeal(h.db, {
      pipelineId,
      stageId,
      ownerId: owner!.id,
      visibilityLevel: "owner",
    });
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `deal:${dealId}`, SIG());
    expect(r.ok).toBe(false);
  });

  test("deal: user in deal's visibility group can subscribe", async () => {
    const [grp] = await h.db.insert(visibilityGroups).values({ name: "grp-1" }).returning();
    const groupId = grp!.id;
    await h.db.insert(visibilityGroupMembers).values({ groupId, userId });

    const [owner] = await h.db
      .insert(users)
      .values({ email: "owner2@example.com", name: "Owner2", googleSub: "g-owner2" })
      .returning();
    const { pipelineId, stageId } = await seedPipelineStage(h.db);
    const dealId = await seedDeal(h.db, {
      pipelineId,
      stageId,
      ownerId: owner!.id,
      visibilityLevel: "group",
      visibilityGroupId: groupId,
    });
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [groupId],
    };
    const r = await authorizeSubscribe(h.db, conn, `deal:${dealId}`, SIG());
    expect(r.ok).toBe(true);
  });

  test("deal: pipeline restriction gate blocks user not in pipeline group even if deal is all-visibility", async () => {
    const [pipeGrp] = await h.db.insert(visibilityGroups).values({ name: "pipe-grp" }).returning();
    const pipeGroupId = pipeGrp!.id;

    const { pipelineId, stageId } = await seedPipelineStage(h.db, {
      visibilityGroupId: pipeGroupId,
    });
    const dealId = await seedDeal(h.db, {
      pipelineId,
      stageId,
      ownerId: userId,
      visibilityLevel: "all",
    });
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `deal:${dealId}`, SIG());
    expect(r.ok).toBe(false);
  });

  test("deal: user in pipeline group passes the pipeline gate for an all-visibility deal", async () => {
    const [pipeGrp] = await h.db
      .insert(visibilityGroups)
      .values({ name: "pipe-grp-2" })
      .returning();
    const pipeGroupId = pipeGrp!.id;
    await h.db.insert(visibilityGroupMembers).values({ groupId: pipeGroupId, userId });

    const { pipelineId, stageId } = await seedPipelineStage(h.db, {
      visibilityGroupId: pipeGroupId,
    });
    const dealId = await seedDeal(h.db, {
      pipelineId,
      stageId,
      ownerId: userId,
      visibilityLevel: "all",
    });
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [pipeGroupId],
    };
    const r = await authorizeSubscribe(h.db, conn, `deal:${dealId}`, SIG());
    expect(r.ok).toBe(true);
  });

  test("deal: admin can subscribe to any deal (regression check)", async () => {
    const [admin] = await h.db
      .insert(users)
      .values({ email: "admin@example.com", name: "Admin", googleSub: "g-admin", isAdmin: true })
      .returning();
    const [adminSession] = await h.db
      .insert(sessions)
      .values({ userId: admin!.id, expiresAt: new Date(Date.now() + 3_600_000) })
      .returning();

    const { pipelineId, stageId } = await seedPipelineStage(h.db);
    const dealId = await seedDeal(h.db, {
      pipelineId,
      stageId,
      ownerId: userId,
      visibilityLevel: "owner",
    });
    const conn = {
      userId: admin!.id,
      sessionId: adminSession!.id,
      name: "Admin",
      isAdmin: true,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `deal:${dealId}`, SIG());
    expect(r.ok).toBe(true);
  });

  // Codex finding F37: an archived pipeline hides ALL its deals from every read/edit path.
  // The WS deal-channel authorization joined pipelines only for the visibility-group gate
  // and never checked is_archived, so a user who still satisfied the raw visibility predicate
  // could subscribe to realtime events for an archived-pipeline deal.
  test("deal: owner is DENIED subscribing to a deal in an archived pipeline", async () => {
    const { pipelineId, stageId } = await seedPipelineStage(h.db);
    const dealId = await seedDeal(h.db, {
      pipelineId,
      stageId,
      ownerId: userId,
      visibilityLevel: "owner",
    });
    await h.db.execute(sql`UPDATE pipelines SET is_archived = true WHERE id = ${pipelineId}`);
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `deal:${dealId}`, SIG());
    expect(r.ok).toBe(false);
  });

  test("deal: admin is DENIED subscribing to a deal in an archived pipeline (hidden from admin too)", async () => {
    const [admin] = await h.db
      .insert(users)
      .values({
        email: "admin-arch@example.com",
        name: "AdminArch",
        googleSub: "g-admin-arch",
        isAdmin: true,
      })
      .returning();
    const [adminSession] = await h.db
      .insert(sessions)
      .values({ userId: admin!.id, expiresAt: new Date(Date.now() + 3_600_000) })
      .returning();

    const { pipelineId, stageId } = await seedPipelineStage(h.db);
    const dealId = await seedDeal(h.db, {
      pipelineId,
      stageId,
      ownerId: userId,
      visibilityLevel: "owner",
    });
    await h.db.execute(sql`UPDATE pipelines SET is_archived = true WHERE id = ${pipelineId}`);
    const conn = {
      userId: admin!.id,
      sessionId: adminSession!.id,
      name: "Admin",
      isAdmin: true,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `deal:${dealId}`, SIG());
    expect(r.ok).toBe(false);
  });
});
