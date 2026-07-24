/**
 * logout.test.ts: TDD tests for logoutCore.
 *
 * Test plan:
 * (a) With a live session: after logoutCore the prior session no longer loads as live.
 * (b) With no session cookie (sid=null): returns ok with userId null, no DB error.
 * (c) With an already-revoked/unknown sid: returns ok with userId null (idempotent).
 * (d) Revokes ALL sessions for the user, not just the presented one.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { logoutCore } from "./logout";
import { createSession, loadLiveSessionByToken as loadLiveSession } from "./session";

let h: TestDb;
let userId: string;

const SIG = () => AbortSignal.timeout(8000);

beforeAll(async () => {
  h = await makeTestDb();
  const [u] = await h.db
    .insert(users)
    .values({ email: "logout@example.com", name: "Logout User", googleSub: "g-lo" })
    .returning();
  userId = u!.id;
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  // Revoke any lingering sessions between tests (leave user intact).
  await h.db.execute(sql`UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL`);
});

describe("logoutCore", () => {
  test("(a) after logout the prior session is no longer live", async () => {
    const created = await createSession(h.db, userId, SIG());
    if (created.ok === false) throw new Error("setup: session creation failed");
    const { sid } = created.value;

    // Confirm the session is live before logout.
    const before = await loadLiveSession(h.db, sid, SIG());
    expect(before.ok).toBe(true);

    const result = await logoutCore({ db: h.db, sid, signal: SIG() });
    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.value.userId).toBe(userId);

    // Session must no longer be live.
    const after = await loadLiveSession(h.db, sid, SIG());
    expect(after.ok).toBe(false);
    if (after.ok === false) expect(after.error).toBe("not_found");
  });

  test("(b) no sid (null) returns ok with userId null, no DB error", async () => {
    const result = await logoutCore({ db: h.db, sid: null, signal: SIG() });
    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.value.userId).toBeNull();
  });

  test("(c) unknown/revoked sid is idempotent (returns ok, userId null)", async () => {
    const result = await logoutCore({
      db: h.db,
      sid: "00000000-0000-0000-0000-000000000000",
      signal: SIG(),
    });
    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.value.userId).toBeNull();
  });

  test("(d) logout revokes all sessions for the user, not only the presented one", async () => {
    const s1 = await createSession(h.db, userId, SIG());
    const s2 = await createSession(h.db, userId, SIG());
    if (s1.ok === false || s2.ok === false) throw new Error("setup: session creation failed");

    // Logout via s1.
    await logoutCore({ db: h.db, sid: s1.value.sid, signal: SIG() });

    // s2 must also be gone.
    const check = await loadLiveSession(h.db, s2.value.sid, SIG());
    expect(check.ok).toBe(false);
  });
});
