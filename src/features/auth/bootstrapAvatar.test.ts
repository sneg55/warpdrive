import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { upsertUserOnLogin, type VerifiedIdentity } from "./bootstrap";

let h: TestDb;
const SIG = () => AbortSignal.timeout(8000);

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.db.execute(
    sql`TRUNCATE labels, stages, pipelines, visibility_group_members, visibility_groups, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
  );
});

function ident(over: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  return { email: "u@example.com", sub: "g-u", name: "U", avatarUrl: null, ...over };
}

async function firstLogin(over: Partial<VerifiedIdentity> = {}): Promise<string> {
  const r = await upsertUserOnLogin(h.db, ident(over), SIG());
  if (!r.ok) throw new Error(`login failed: ${r.error}`);
  return r.value.userId;
}

describe("avatar preservation across re-login", () => {
  test("re-login does NOT clobber an uploaded avatar with a null identity photo", async () => {
    const userId = await firstLogin();
    // Simulate an avatar upload: the avatar service stores the internal serve-route URL.
    const uploaded = `/api/users/${userId}/avatar?v=abc123`;
    await h.db.update(users).set({ avatarUrl: uploaded }).where(eq(users.id, userId));

    // Same Google subject re-logs in with no photo (dev login, or a photoless Workspace account).
    const again = await upsertUserOnLogin(h.db, ident({ avatarUrl: null }), SIG());
    expect(again.ok).toBe(true);

    const [row] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(row?.avatarUrl).toBe(uploaded);
  });

  test("re-login still refreshes a provider photo when no avatar was uploaded", async () => {
    const userId = await firstLogin({ avatarUrl: "https://lh3.googleusercontent.com/old" });

    const again = await upsertUserOnLogin(
      h.db,
      ident({ avatarUrl: "https://lh3.googleusercontent.com/new" }),
      SIG(),
    );
    expect(again.ok).toBe(true);

    const [row] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(row?.avatarUrl).toBe("https://lh3.googleusercontent.com/new");
  });
});
