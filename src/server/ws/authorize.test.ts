import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  pipelines,
  sessions,
  stages,
  users,
  visibilityGroupMembers,
  visibilityGroups,
} from "@/db/schema";
import { sessionFixture } from "@/features/auth/session.test-helpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { authorizeSubscribe, consumeTicketAndBind } from "./authorize";
import { mintTicket } from "./ticket";

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
    .values(sessionFixture({ userId, expiresAt: new Date(Date.now() + 3_600_000) }))
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

describe("ws authorize", () => {
  test("a fresh ticket is consumed and binds the connection", async () => {
    const token = await mintTicket({ userId, sessionId });
    const r = await consumeTicketAndBind(h.db, token, SIG());
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.userId).toBe(userId);
  });

  test("the same ticket cannot be consumed twice (replay)", async () => {
    const token = await mintTicket({ userId, sessionId });
    await consumeTicketAndBind(h.db, token, SIG());
    const replay = await consumeTicketAndBind(h.db, token, SIG());
    expect(replay.ok).toBe(false);
  });

  test("a ticket for a revoked session is refused at consume", async () => {
    const token = await mintTicket({ userId, sessionId });
    await h.db.execute(sql`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId}`);
    const r = await consumeTicketAndBind(h.db, token, SIG());
    expect(r.ok).toBe(false);
  });

  test("user:{id} subscribe allowed only for own id", async () => {
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [] as string[],
    };
    expect((await authorizeSubscribe(h.db, conn, `user:${userId}`, SIG())).ok).toBe(true);
    expect((await authorizeSubscribe(h.db, conn, "user:someone-else", SIG())).ok).toBe(false);
  });

  // Deal-channel authorization tests live in authorizeDeal.test.ts (file-size split).

  // ---- pipeline channel authorization ----

  test("pipeline: regular user can subscribe to a non-restricted pipeline (null group)", async () => {
    const { pipelineId } = await seedPipelineStage(h.db);
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `pipeline:${pipelineId}`, SIG());
    expect(r.ok).toBe(true);
  });

  test("pipeline: regular user NOT in pipeline group is denied a restricted pipeline", async () => {
    const [grp] = await h.db.insert(visibilityGroups).values({ name: "pipe-restrict" }).returning();
    const { pipelineId } = await seedPipelineStage(h.db, { visibilityGroupId: grp!.id });
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `pipeline:${pipelineId}`, SIG());
    expect(r.ok).toBe(false);
  });

  test("pipeline: regular user IN pipeline group is allowed", async () => {
    const [grp] = await h.db.insert(visibilityGroups).values({ name: "pipe-allow" }).returning();
    const groupId = grp!.id;
    await h.db.insert(visibilityGroupMembers).values({ groupId, userId });

    const { pipelineId } = await seedPipelineStage(h.db, { visibilityGroupId: groupId });
    const conn = {
      userId,
      sessionId,
      name: "W",
      isAdmin: false,
      isActive: true,
      groupIds: [groupId],
    };
    const r = await authorizeSubscribe(h.db, conn, `pipeline:${pipelineId}`, SIG());
    expect(r.ok).toBe(true);
  });

  test("pipeline: admin can subscribe to any pipeline (regression check)", async () => {
    const [grp] = await h.db
      .insert(visibilityGroups)
      .values({ name: "pipe-admin-grp" })
      .returning();
    const { pipelineId } = await seedPipelineStage(h.db, { visibilityGroupId: grp!.id });
    const [admin] = await h.db
      .insert(users)
      .values({ email: "adm2@example.com", name: "Adm", googleSub: "g-adm2", isAdmin: true })
      .returning();
    const [adminSess] = await h.db
      .insert(sessions)
      .values(sessionFixture({ userId: admin!.id, expiresAt: new Date(Date.now() + 3_600_000) }))
      .returning();
    const conn = {
      userId: admin!.id,
      sessionId: adminSess!.id,
      name: "Adm",
      isAdmin: true,
      isActive: true,
      groupIds: [] as string[],
    };
    const r = await authorizeSubscribe(h.db, conn, `pipeline:${pipelineId}`, SIG());
    expect(r.ok).toBe(true);
  });
});
