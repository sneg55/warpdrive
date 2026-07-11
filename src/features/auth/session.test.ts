import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { permissionSets, sessions, users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { createSession, loadLiveSession, revokeAllSessions } from "./session";

let h: TestDb;
let userId: string;

beforeAll(async () => {
  h = await makeTestDb();
  const [ps] = await h.db.insert(permissionSets).values({ name: "Regular", flags: {} }).returning();
  const [u] = await h.db
    .insert(users)
    .values({ email: "s@example.com", name: "S", googleSub: "g-s", permissionSetId: ps!.id })
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
    // Insert directly: not revoked, active user, but expires_at in the past.
    const [row] = await h.db
      .insert(sessions)
      .values({ userId, expiresAt: new Date(Date.now() - 60_000) })
      .returning();
    if (row === undefined) throw new Error("setup");
    const loaded = await loadLiveSession(h.db, row.id, AbortSignal.timeout(5000));
    expect(loaded.ok).toBe(false);
    if (loaded.ok === false) expect(loaded.error).toBe("not_found");
  });
});
