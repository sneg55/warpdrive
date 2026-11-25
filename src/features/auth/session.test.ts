import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { permissionSets, sessions, users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import {
  createSession,
  loadLiveSessionById,
  loadLiveSessionByToken,
  revokeAllSessions,
} from "./session";

const loadLiveSession = loadLiveSessionByToken;

let h: TestDb;
let userId: string;

beforeAll(async () => {
  h = await makeTestDb();
  const [ps] = await h.db.insert(permissionSets).values({ name: "Regular", flags: {} }).returning();
  const [u] = await h.db
    .insert(users)
    .values({ email: "s@example.com", name: "S", permissionSetId: ps!.id })
    .returning();
  userId = u!.id;
});
afterAll(async () => {
  await h.close();
});

describe("sessions", () => {
  test("create then load returns a live session", async () => {
    const created = await createSession(h.db, userId, AbortSignal.timeout(5000));
    expect(created.ok).toBe(true);
    if (created.ok === false) return;
    const loaded = await loadLiveSession(h.db, created.value.sid, AbortSignal.timeout(5000));
    expect(loaded.ok).toBe(true);
    if (loaded.ok === true) expect(loaded.value.userId).toBe(userId);
  });

  test("revoked session is not live", async () => {
    const created = await createSession(h.db, userId, AbortSignal.timeout(5000));
    if (created.ok === false) throw new Error("setup");
    await revokeAllSessions(h.db, userId, AbortSignal.timeout(5000));
    const loaded = await loadLiveSession(h.db, created.value.sid, AbortSignal.timeout(5000));
    expect(loaded.ok).toBe(false);
  });

  test("deactivated user makes the session not live (rule 0)", async () => {
    const created = await createSession(h.db, userId, AbortSignal.timeout(5000));
    if (created.ok === false) throw new Error("setup");
    const { eq } = await import("drizzle-orm");
    await h.db.update(users).set({ isActive: false }).where(eq(users.id, userId));
    const loaded = await loadLiveSession(h.db, created.value.sid, AbortSignal.timeout(5000));
    expect(loaded.ok).toBe(false);
    await h.db.update(users).set({ isActive: true }).where(eq(users.id, userId));
  });

  test("expired session is not live (expiry arm)", async () => {
    const created = await createSession(h.db, userId, AbortSignal.timeout(5000));
    if (created.ok === false) throw new Error("setup");
    await h.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(sessions.userId, userId));
    const loaded = await loadLiveSession(h.db, created.value.sid, AbortSignal.timeout(5000));
    expect(loaded.ok).toBe(false);
    if (loaded.ok === false) expect(loaded.error).toBe("not_found");
    await h.db.delete(sessions).where(eq(sessions.userId, userId));
  });
});

describe("session token is not stored in the clear", () => {
  test("no stored column contains the cookie value", async () => {
    const created = await createSession(h.db, userId, AbortSignal.timeout(5000));
    if (created.ok === false) throw new Error("setup");
    const sid = created.value.sid;

    const rows = await h.db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(sid);

    await h.db.delete(sessions).where(eq(sessions.userId, userId));
  });

  test("the row id is not the cookie value, so leaking one does not leak the other", async () => {
    const created = await createSession(h.db, userId, AbortSignal.timeout(5000));
    if (created.ok === false) throw new Error("setup");
    const [row] = await h.db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(row?.id).not.toBe(created.value.sid);

    const loaded = await loadLiveSession(h.db, row?.id ?? "", AbortSignal.timeout(5000));
    expect(loaded.ok).toBe(false);

    await h.db.delete(sessions).where(eq(sessions.userId, userId));
  });
});

describe("loadLiveSessionById", () => {
  test("loads a live session by its internal id", async () => {
    const created = await createSession(h.db, userId, AbortSignal.timeout(5000));
    if (created.ok === false) throw new Error("setup");

    const loaded = await loadLiveSessionById(
      h.db,
      created.value.sessionId,
      AbortSignal.timeout(5000),
    );
    expect(loaded.ok).toBe(true);
    if (loaded.ok === true) expect(loaded.value.userId).toBe(userId);

    await h.db.delete(sessions).where(eq(sessions.userId, userId));
  });

  test("does not load a revoked session", async () => {
    const created = await createSession(h.db, userId, AbortSignal.timeout(5000));
    if (created.ok === false) throw new Error("setup");
    await revokeAllSessions(h.db, userId, AbortSignal.timeout(5000));

    const loaded = await loadLiveSessionById(
      h.db,
      created.value.sessionId,
      AbortSignal.timeout(5000),
    );
    expect(loaded.ok).toBe(false);

    await h.db.delete(sessions).where(eq(sessions.userId, userId));
  });
});
