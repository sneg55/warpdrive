import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { userIdentities, users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { upsertUserOnLogin, type VerifiedIdentity } from "./bootstrap";

let h: TestDb;
const SIG = () => AbortSignal.timeout(8000);
const OIDC_PROVIDER = "http://authelia.localhost:9091";

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
});

function identity(over: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  return {
    email: "alice@example.com",
    sub: "g-1",
    name: "Alice",
    preferredUsername: null,
    avatarUrl: null,
    ...over,
  };
}

async function login(provider: string, ident: VerifiedIdentity) {
  return upsertUserOnLogin(h.db, { provider, identity: ident }, SIG());
}

describe("sign-in identity matching", () => {
  test("a first login stores a provider-keyed identity row", async () => {
    const r = await login("google", identity());
    expect(r.ok).toBe(true);

    const rows = await h.db.select().from(userIdentities);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe("google");
    expect(rows[0]!.subject).toBe("g-1");
    expect(rows[0]!.userId).toBe(r.ok ? r.value.userId : "");
  });

  test("re-login with the same provider and subject reuses the account", async () => {
    const first = await login("google", identity());
    const second = await login("google", identity({ name: "Alice Updated" }));
    expect(second.ok).toBe(true);
    if (second.ok && first.ok) expect(second.value.userId).toBe(first.value.userId);
    const [u] = await h.db.select().from(users);
    expect(u!.name).toBe("Alice Updated");
    expect(await h.db.select().from(userIdentities)).toHaveLength(1);
  });

  test("the same subject under a different provider is a distinct identity, not a match", async () => {
    await login("google", identity());
    const second = await login(OIDC_PROVIDER, identity({ sub: "g-1" }));
    expect(second.ok).toBe(false);
    expect(await h.db.select().from(userIdentities)).toHaveLength(1);
  });

  test("re-login with the same identity and a changed email updates the account", async () => {
    const first = await login("google", identity());
    const second = await login("google", identity({ email: "alice.new@example.com" }));
    expect(second.ok).toBe(true);
    if (second.ok && first.ok) expect(second.value.userId).toBe(first.value.userId);
    const [u] = await h.db.select().from(users);
    expect(u!.email).toBe("alice.new@example.com");
  });

  test("a known identity whose email now belongs to another user is a conflict, not a server error", async () => {
    const first = await login("google", identity({ email: "one@ex.com", sub: "g-1" }));
    expect(first.ok).toBe(true);
    const other = await login("google", identity({ email: "two@ex.com", sub: "g-2", name: "Two" }));
    expect(other.ok).toBe(true);

    const moved = await login("google", identity({ email: "two@ex.com", sub: "g-1" }));
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.error).toContain("identity_conflict");

    const rows = await h.db.execute(sql`SELECT email FROM users ORDER BY email`);
    expect(rows.rows).toEqual([{ email: "one@ex.com" }, { email: "two@ex.com" }]);
  });

  test("does not rebind an account when the same email arrives with a new subject", async () => {
    await login("google", identity());
    const second = await login("google", identity({ sub: "g-evil" }));
    expect(second.ok).toBe(false);
    expect(await h.db.select().from(userIdentities)).toHaveLength(1);
  });

  test("conflicts across providers: a google-bound email rejects an oidc identity", async () => {
    await login("google", identity());
    const second = await login(OIDC_PROVIDER, identity({ sub: "oidc-1" }));
    expect(second.ok).toBe(false);
    expect(await h.db.select().from(userIdentities)).toHaveLength(1);
  });

  test("adopts an invited placeholder (no identities) on first login by email", async () => {
    const [placeholder] = await h.db
      .insert(users)
      .values({ email: "new@ex.com", name: "New", invitedAt: new Date() })
      .returning();

    const r = await login("google", identity({ email: "new@ex.com", sub: "google-123" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.userId).toBe(placeholder!.id);

    const [u] = await h.db.select().from(users).where(eq(users.email, "new@ex.com"));
    expect(u!.name).toBe("Alice");
    expect(u!.invitedAt).toBeNull();
    const identities = await h.db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, placeholder!.id));
    expect(identities).toHaveLength(1);
    expect(identities[0]!.provider).toBe("google");
    expect(identities[0]!.subject).toBe("google-123");
  });

  test("an adopted user can then add the other provider only after a reset, not by login", async () => {
    await login("google", identity());
    const conflict = await login(OIDC_PROVIDER, identity({ sub: "oidc-2" }));
    expect(conflict.ok).toBe(false);
  });
});

describe("optional claims fallbacks", () => {
  test("a missing name falls back to preferred_username, then to the email local part", async () => {
    await login(
      "google",
      identity({ email: "first@ex.com", sub: "s1", name: null, preferredUsername: "firstuser" }),
    );
    await login(
      "google",
      identity({ email: "second@ex.com", sub: "s2", name: null, preferredUsername: null }),
    );

    const names = await h.db.execute(sql`SELECT email, name FROM users ORDER BY email`);
    expect(names.rows).toEqual([
      { email: "first@ex.com", name: "firstuser" },
      { email: "second@ex.com", name: "second" },
    ]);
  });

  test("a re-login without a name claim never clobbers the stored name", async () => {
    await login("google", identity({ name: "Kept Name" }));
    await login("google", identity({ name: null }));
    const [u] = await h.db.select().from(users);
    expect(u!.name).toBe("Kept Name");
  });

  test("creation without a picture claim leaves the avatar empty", async () => {
    await login("google", identity({ email: "nopicture@ex.com", sub: "s3" }));
    const [u] = await h.db.select().from(users);
    expect(u!.avatarUrl).toBeNull();
  });

  test("a picture claim is stored as-is", async () => {
    await login("google", identity({ avatarUrl: "https://pics.example.com/a.png" }));
    const [u] = await h.db.select().from(users);
    expect(u!.avatarUrl).toBe("https://pics.example.com/a.png");
  });

  test("a later login without a picture claim does not replace the stored avatar", async () => {
    await login("google", identity({ avatarUrl: "https://pics.example.com/a.png" }));
    await login("google", identity({ avatarUrl: null }));
    const [u] = await h.db.select().from(users);
    expect(u!.avatarUrl).toBe("https://pics.example.com/a.png");
  });

  test("a login without a picture claim leaves a null avatar null", async () => {
    const [placeholder] = await h.db
      .insert(users)
      .values({ email: "null@ex.com", name: "Null Avatar", invitedAt: new Date() })
      .returning();
    expect(placeholder!.avatarUrl).toBeNull();

    await login("google", identity({ email: "null@ex.com", sub: "s4", avatarUrl: null }));
    const [u] = await h.db.select().from(users);
    expect(u!.avatarUrl).toBeNull();
  });
});
