import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { userIdentities, users } from "@/db/schema";
import { resetUserIdentities } from "@/features/identity/users.service";
import { makeTestDb, type TestDb } from "@/test/db";
import { upsertUserOnLogin, type VerifiedIdentity } from "./bootstrap";

let h: TestDb;
const SIG = () => AbortSignal.timeout(8000);

const ADMIN = {
  id: "00000000-0000-4000-8000-0000000000aa",
  type: "admin" as const,
  flags: new Set<never>(),
  isActive: true,
  groupIds: new Set<string>(),
};

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.db.execute(
    sql`TRUNCATE labels, stages, pipelines, visibility_group_members, visibility_groups, user_identities, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
  );
});

function ident(over: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  return {
    email: "u@example.com",
    sub: "g-u",
    name: "U",
    preferredUsername: null,
    avatarUrl: null,
    ...over,
  };
}

async function firstLogin(over: Partial<VerifiedIdentity> = {}): Promise<string> {
  const r = await upsertUserOnLogin(h.db, { provider: "google", identity: ident(over) }, SIG());
  if (!r.ok) throw new Error(`login failed: ${r.error}`);
  return r.value.userId;
}

describe("avatar preservation across re-login", () => {
  test("re-login does NOT clobber an uploaded avatar with a null identity photo", async () => {
    const userId = await firstLogin();
    const uploaded = `/api/users/${userId}/avatar?v=abc123`;
    await h.db.update(users).set({ avatarUrl: uploaded }).where(eq(users.id, userId));

    const again = await upsertUserOnLogin(
      h.db,
      { provider: "google", identity: ident({ avatarUrl: null }) },
      SIG(),
    );
    expect(again.ok).toBe(true);

    const [row] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(row?.avatarUrl).toBe(uploaded);
  });

  test("re-login still refreshes a provider photo when no avatar was uploaded", async () => {
    const userId = await firstLogin({ avatarUrl: "https://lh3.googleusercontent.com/old" });

    const again = await upsertUserOnLogin(
      h.db,
      {
        provider: "google",
        identity: ident({ avatarUrl: "https://lh3.googleusercontent.com/new" }),
      },
      SIG(),
    );
    expect(again.ok).toBe(true);

    const [row] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(row?.avatarUrl).toBe("https://lh3.googleusercontent.com/new");
  });

  test("login after an admin identity reset does NOT clobber an uploaded avatar with a provider photo", async () => {
    const userId = await firstLogin();
    const uploaded = `/api/users/${userId}/avatar?v=abc123`;
    await h.db.update(users).set({ avatarUrl: uploaded }).where(eq(users.id, userId));
    await h.db
      .insert(users)
      .values({ id: ADMIN.id, email: "admin@example.com", name: "Admin", isAdmin: true });

    const reset = await resetUserIdentities(h.db, ADMIN, { userId }, SIG());
    expect(reset.ok).toBe(true);

    const again = await upsertUserOnLogin(
      h.db,
      {
        provider: "google",
        identity: ident({ avatarUrl: "https://lh3.googleusercontent.com/new" }),
      },
      SIG(),
    );
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.userId).toBe(userId);

    const [row] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(row?.avatarUrl).toBe(uploaded);
  });

  test("login after an admin identity reset still refreshes a provider photo when no avatar was uploaded", async () => {
    const userId = await firstLogin({ avatarUrl: "https://lh3.googleusercontent.com/old" });
    await h.db.delete(userIdentities).where(eq(userIdentities.userId, userId));

    const again = await upsertUserOnLogin(
      h.db,
      {
        provider: "google",
        identity: ident({ avatarUrl: "https://lh3.googleusercontent.com/new" }),
      },
      SIG(),
    );
    expect(again.ok).toBe(true);

    const [row] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(row?.avatarUrl).toBe("https://lh3.googleusercontent.com/new");
  });
});
