import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err, ok } from "@/types/result";
import { encryptToken } from "./crypto";
import { type AccessToken, ensureAccessToken } from "./tokens";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

// Seed a connected account holding an encrypted refresh token. Returns the account id.
async function seedAccount(db: TestDb, email = "a@example.com"): Promise<string> {
  const uRes = await db.execute(
    sql`INSERT INTO users (email, name, google_sub) VALUES (${email},'A',${`sub-${email}`}) RETURNING id`,
  );
  const u = uRes.rows[0] as { id: string };
  const enc = encryptToken("refresh-1");
  const aRes = await db.execute(
    sql`INSERT INTO email_accounts (user_id, email_address, refresh_token_enc, status)
        VALUES (${u.id}, ${email}, ${enc}, 'connected') RETURNING id`,
  );
  return (aRes.rows[0] as { id: string }).id;
}

const refreshShouldNotRun = {
  refresh: () => {
    throw new Error("deps.refresh must not be called");
  },
};

describe("ensureAccessToken", () => {
  it("reuses a cached token that is not near expiry (no refresh call)", async () => {
    await withTestDb(async (db) => {
      const id = await seedAccount(db);
      const cached: AccessToken = { token: "still-good", expiresAt: Date.now() + 600_000 };
      const r = await ensureAccessToken(db, { accountId: id, cached, deps: refreshShouldNotRun });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.token).toBe("still-good");
    });
  });

  it("decrypts the stored refresh token and returns a new access token when expired", async () => {
    await withTestDb(async (db) => {
      const id = await seedAccount(db);
      let seenRefresh: string | undefined;
      const r = await ensureAccessToken(db, {
        accountId: id,
        now: 1_000_000,
        deps: {
          refresh: (rt) => {
            seenRefresh = rt;
            return Promise.resolve(ok({ accessToken: "new-at", expiresIn: 3600 }));
          },
        },
      });
      expect(r.ok).toBe(true);
      // The refresh callback received the decrypted refresh token, not ciphertext.
      expect(seenRefresh).toBe("refresh-1");
      if (r.ok) {
        expect(r.value.token).toBe("new-at");
        expect(r.value.expiresAt).toBe(1_000_000 + 3600 * 1000);
      }
    });
  });

  it("disconnects the account on invalid_grant and nulls the refresh token", async () => {
    await withTestDb(async (db) => {
      const id = await seedAccount(db);
      const r = await ensureAccessToken(db, {
        accountId: id,
        deps: {
          refresh: () => Promise.resolve(err(new AppError("E_GMAIL_002", "invalid_grant", {}))),
        },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_002");
      const row = (
        await db.execute(
          sql`SELECT status, last_error_id, refresh_token_enc FROM email_accounts WHERE id=${id}`,
        )
      ).rows[0] as {
        status: string;
        last_error_id: string | null;
        refresh_token_enc: Buffer | null;
      };
      expect(row.status).toBe("disconnected");
      expect(row.last_error_id).toBe("E_GMAIL_002");
      expect(row.refresh_token_enc).toBeNull();
    });
  });

  it("returns a transient error WITHOUT disconnecting the account", async () => {
    await withTestDb(async (db) => {
      const id = await seedAccount(db);
      const r = await ensureAccessToken(db, {
        accountId: id,
        deps: {
          refresh: () => Promise.resolve(err(new AppError("E_GMAIL_001", "rate limited", {}))),
        },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_001");
      // Account stays connected with its token intact: the caller retries later.
      const row = (
        await db.execute(sql`SELECT status, refresh_token_enc FROM email_accounts WHERE id=${id}`)
      ).rows[0] as { status: string; refresh_token_enc: Buffer | null };
      expect(row.status).toBe("connected");
      expect(row.refresh_token_enc).not.toBeNull();
    });
  });

  it("propagates a decrypt failure WITHOUT disconnecting (server-side key/data error, not revocation)", async () => {
    await withTestDb(async (db) => {
      const id = await seedAccount(db);
      // Corrupt the stored blob so decryptToken fails the auth-tag check.
      await db.execute(
        sql`UPDATE email_accounts SET refresh_token_enc=${randomBytes(40)} WHERE id=${id}`,
      );
      const r = await ensureAccessToken(db, {
        accountId: id,
        deps: refreshShouldNotRun,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe("E_GMAIL_005");
      // Decrypt failure must NOT disconnect: it is a key/data problem, not a revocation.
      const row = (
        await db.execute(sql`SELECT status, refresh_token_enc FROM email_accounts WHERE id=${id}`)
      ).rows[0] as { status: string; refresh_token_enc: Buffer | null };
      expect(row.status).toBe("connected");
      expect(row.refresh_token_enc).not.toBeNull();
    });
  });

  it("re-encrypts and persists a rotated refresh token", async () => {
    await withTestDb(async (db) => {
      const id = await seedAccount(db);
      const r = await ensureAccessToken(db, {
        accountId: id,
        deps: {
          refresh: () =>
            Promise.resolve(
              ok({ accessToken: "new-at", expiresIn: 3600, refreshToken: "refresh-2" }),
            ),
        },
      });
      expect(r.ok).toBe(true);
      // The new ciphertext must decrypt to the rotated value. A second ensureAccessToken
      // proves it: with no cache it decrypts the stored token and hands it to refresh.
      let seenRefresh: string | undefined;
      const r2 = await ensureAccessToken(db, {
        accountId: id,
        deps: {
          refresh: (rt) => {
            seenRefresh = rt;
            return Promise.resolve(ok({ accessToken: "at-2", expiresIn: 3600 }));
          },
        },
      });
      expect(r2.ok).toBe(true);
      expect(seenRefresh).toBe("refresh-2");
    });
  });
});
