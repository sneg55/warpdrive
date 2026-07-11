import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { ok } from "@/types/result";
import { buildAuthUrl, exchangeAndBind, stateMatches } from "./oauth";

// Injected HTTP layer (token exchange + identity). The DB write hits real Postgres.
// Fixtures use the test-env workspace domain (vitest.setup.ts: example.com) so the
// hd / domain check passes on the happy path. The binding rule itself is exercised
// by the rejection cases below.
const goodDeps = {
  exchangeCode: () =>
    Promise.resolve(
      ok({ accessToken: "at", refreshToken: "rt", scopes: ["gmail.modify", "gmail.send"] }),
    ),
  fetchIdentity: () =>
    Promise.resolve(ok({ email: "me@example.com", emailVerified: true, hd: "example.com" })),
};

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedUser(
  db: TestDb,
  email = "me@example.com",
  sub = "sub-me",
): Promise<{ id: string }> {
  const res = await db.execute(
    sql`INSERT INTO users (email, name, google_sub) VALUES (${email},'Me',${sub}) RETURNING id`,
  );
  return res.rows[0] as { id: string };
}

describe("stateMatches (login-CSRF state compare)", () => {
  it("returns true for equal state values", () => {
    expect(stateMatches("abc123", "abc123")).toBe(true);
  });
  it("returns false for differing state values", () => {
    expect(stateMatches("abc123", "different")).toBe(false);
  });
  it("returns false when the cookie is missing", () => {
    expect(stateMatches("abc123", undefined)).toBe(false);
  });
  it("returns false for an empty query state even if the cookie is empty", () => {
    expect(stateMatches("", "")).toBe(false);
  });
});

describe("Gmail consent scopes", () => {
  // The callback resolves the Google identity via the userinfo endpoint
  // (openidconnect.googleapis.com/v1/userinfo), which returns email / email_verified /
  // hd ONLY when the access token carries an OIDC identity scope. Without one, userinfo
  // 403s, fetchIdentity errors, and the connect silently fails with no mailbox stored.
  // So the consent URL MUST request openid + email alongside the Gmail scopes.
  const scopes = new URLSearchParams(buildAuthUrl({ userId: "u1", state: "s1" }).split("?")[1])
    .get("scope")
    ?.split(" ");

  it("requests an OIDC identity scope so the userinfo call can resolve the mailbox owner", () => {
    expect(scopes).toContain("openid");
    expect(scopes).toContain("email");
  });

  it("still requests the Gmail send + modify scopes", () => {
    expect(scopes).toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(scopes).toContain("https://www.googleapis.com/auth/gmail.send");
  });
});

describe("OAuth identity binding", () => {
  it("stores an encrypted token only when identity matches the signed-in user", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await exchangeAndBind({
        db,
        code: "c",
        sessionUserId: u.id,
        sessionEmail: "me@example.com",
        deps: goodDeps,
      });
      expect(r.ok).toBe(true);
      const res = await db.execute(
        sql`SELECT status, refresh_token_enc FROM email_accounts WHERE user_id=${u.id}`,
      );
      const acct = res.rows[0] as { status: string; refresh_token_enc: Buffer };
      expect(acct.status).toBe("connected");
      // iv(12) + tag(16) + ciphertext(>0) means the stored blob exceeds 28 bytes.
      expect(acct.refresh_token_enc.length).toBeGreaterThan(28);
    });
  });

  it("rejects a connected mailbox whose address differs from the session (no token stored)", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const badDeps = {
        ...goodDeps,
        fetchIdentity: () =>
          Promise.resolve(
            ok({ email: "someone-else@example.com", emailVerified: true, hd: "example.com" }),
          ),
      };
      const r = await exchangeAndBind({
        db,
        code: "c",
        sessionUserId: u.id,
        sessionEmail: "me@example.com",
        deps: badDeps,
      });
      expect(r.ok).toBe(false);
      const res = await db.execute(
        sql`SELECT count(*)::int AS n FROM email_accounts WHERE user_id=${u.id}`,
      );
      const count = res.rows[0] as { n: number };
      expect(count.n).toBe(0);
    });
  });

  it("rejects an unverified email or wrong hosted domain", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await exchangeAndBind({
        db,
        code: "c",
        sessionUserId: u.id,
        sessionEmail: "me@example.com",
        deps: {
          ...goodDeps,
          fetchIdentity: () =>
            Promise.resolve(
              ok({ email: "me@example.com", emailVerified: false, hd: "example.com" }),
            ),
        },
      });
      expect(r.ok).toBe(false);
    });
  });

  it("rejects when hd is not the workspace domain even though email and verification match (no token)", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await exchangeAndBind({
        db,
        code: "c",
        sessionUserId: u.id,
        sessionEmail: "me@example.com",
        deps: {
          ...goodDeps,
          // Same address, verified, but a foreign hosted domain: the hd gate must reject.
          fetchIdentity: () =>
            Promise.resolve(ok({ email: "me@example.com", emailVerified: true, hd: "evil.com" })),
        },
      });
      expect(r.ok).toBe(false);
      const res = await db.execute(
        sql`SELECT count(*)::int AS n FROM email_accounts WHERE user_id=${u.id}`,
      );
      expect((res.rows[0] as { n: number }).n).toBe(0);
    });
  });

  it("rejects a second user binding an address already connected to another user (no 500, no clobber)", async () => {
    await withTestDb(async (db) => {
      // User A connects shared@example.com successfully.
      const a = await seedUser(db, "a@example.com", "sub-a");
      const aBind = await exchangeAndBind({
        db,
        code: "c",
        sessionUserId: a.id,
        sessionEmail: "shared@example.com",
        deps: {
          ...goodDeps,
          fetchIdentity: () =>
            Promise.resolve(
              ok({ email: "shared@example.com", emailVerified: true, hd: "example.com" }),
            ),
        },
      });
      expect(aBind.ok).toBe(true);

      // User B (a different session) tries to bind the same Gmail address.
      const b = await seedUser(db, "shared@example.com", "sub-b");
      const bBind = await exchangeAndBind({
        db,
        code: "c2",
        sessionUserId: b.id,
        sessionEmail: "shared@example.com",
        deps: {
          ...goodDeps,
          fetchIdentity: () =>
            Promise.resolve(
              ok({ email: "shared@example.com", emailVerified: true, hd: "example.com" }),
            ),
        },
      });
      expect(bBind.ok).toBe(false);
      if (!bBind.ok) {
        expect(bBind.error.id).toBe("E_GMAIL_006");
      }

      // A's row is untouched and B has no account row.
      const aRow = await db.execute(
        sql`SELECT user_id FROM email_accounts WHERE email_address='shared@example.com'`,
      );
      expect(aRow.rows).toHaveLength(1);
      expect((aRow.rows[0] as { user_id: string }).user_id).toBe(a.id);
      const bRow = await db.execute(
        sql`SELECT count(*)::int AS n FROM email_accounts WHERE user_id=${b.id}`,
      );
      expect((bRow.rows[0] as { n: number }).n).toBe(0);
    });
  });
});
