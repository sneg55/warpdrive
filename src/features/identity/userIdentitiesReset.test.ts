import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { auditEvents, sessions, userIdentities, users } from "@/db/schema";
import type { TestDb } from "@/test/db";
import { makeTestDb } from "@/test/db";
import { resetUserIdentities } from "./users.service";

let h: TestDb;
const SIG = () => AbortSignal.timeout(8000);

const ADMIN = {
  id: "00000000-0000-4000-8000-000000000001",
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
    sql`TRUNCATE visibility_group_members, visibility_groups, user_identities, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
  );
  await h.db.insert(users).values({
    id: ADMIN.id,
    email: "admin@example.com",
    name: "Admin",
    isAdmin: true,
  });
});

async function seedBoundUser(): Promise<string> {
  const [u] = await h.db.insert(users).values({ email: "bound@ex.com", name: "Bound" }).returning();
  await h.db.insert(userIdentities).values({
    userId: u!.id,
    provider: "google",
    subject: "g-bound",
  });
  return u!.id;
}

describe("resetUserIdentities", () => {
  test("removes every sign-in identity of the target user", async () => {
    const userId = await seedBoundUser();
    const r = await resetUserIdentities(h.db, ADMIN, { userId }, SIG());
    expect(r.ok).toBe(true);
    expect(await h.db.select().from(userIdentities)).toHaveLength(0);
  });

  test("revokes the target user's live sessions so the reset takes effect immediately", async () => {
    const userId = await seedBoundUser();
    await h.db.insert(sessions).values({
      tokenHash: "hash-1",
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const r = await resetUserIdentities(h.db, ADMIN, { userId }, SIG());
    expect(r.ok).toBe(true);
    const [s] = await h.db.select().from(sessions);
    expect(s!.revokedAt).not.toBeNull();
  });

  test("records an audit event", async () => {
    const userId = await seedBoundUser();
    await resetUserIdentities(h.db, ADMIN, { userId }, SIG());
    const events = await h.db.select().from(auditEvents);
    const reset = events.find((e) => e.action === "user.reset_identities");
    expect(reset).toBeDefined();
    expect(reset!.targetId).toBe(userId);
  });

  test("returns not_found for an unknown user", async () => {
    const r = await resetUserIdentities(
      h.db,
      ADMIN,
      { userId: "00000000-0000-4000-8000-0000000000ff" },
      SIG(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_found");
  });

  test("requires an admin", async () => {
    const userId = await seedBoundUser();
    const regular = {
      id: "00000000-0000-4000-8000-000000000002",
      type: "regular" as const,
      flags: new Set<never>(),
      isActive: true,
      groupIds: new Set<string>(),
    };
    const r = await resetUserIdentities(h.db, regular, { userId }, SIG());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("admin required");
    expect(await h.db.select().from(userIdentities)).toHaveLength(1);
  });

  test("a user whose identities are reset can be adopted by a new provider by email", async () => {
    const userId = await seedBoundUser();
    await resetUserIdentities(h.db, ADMIN, { userId }, SIG());
    const { upsertUserOnLogin } = await import("@/features/auth/bootstrap");
    const login = await upsertUserOnLogin(
      h.db,
      {
        provider: "http://authelia.localhost:9091",
        identity: {
          email: "bound@ex.com",
          sub: "oidc-1",
          name: "Bound",
          preferredUsername: null,
          avatarUrl: null,
        },
      },
      SIG(),
    );
    expect(login.ok).toBe(true);
    if (login.ok) expect(login.value.userId).toBe(userId);
  });
});
