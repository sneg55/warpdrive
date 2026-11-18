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
  await h.db.execute(sql`UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL`);
});

describe("logoutCore", () => {
  test("(a) after logout the prior session is no longer live", async () => {
    const created = await createSession(h.db, userId, SIG());
    if (created.ok === false) throw new Error("setup: session creation failed");
    const { sid } = created.value;

    const before = await loadLiveSession(h.db, sid, SIG());
    expect(before.ok).toBe(true);

    const result = await logoutCore({ db: h.db, sid, signal: SIG() });
    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.value.userId).toBe(userId);

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

    await logoutCore({ db: h.db, sid: s1.value.sid, signal: SIG() });

    const check = await loadLiveSession(h.db, s2.value.sid, SIG());
    expect(check.ok).toBe(false);
  });
});
