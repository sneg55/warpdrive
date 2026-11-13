import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { decryptToken, encryptToken } from "@/features/email/crypto";
import { err, ok } from "@/types/result";
import { withAccessToken } from "./tokens";
import type { XClient } from "./types";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const HOUR_MS = 3_600_000;

async function seedAccount(
  db: Db,
  o: { expiresInMs: number | null; access?: Buffer | null; refresh?: string | null },
): Promise<string> {
  const [row] = await db
    .insert(xAccounts)
    .values({
      xUserId: `x-${Math.random().toString(36).slice(2)}`,
      username: "acct",
      displayName: "Acct",
      refreshTokenEnc: o.refresh === null ? null : encryptToken(o.refresh ?? "stored-refresh"),
      accessTokenEnc: o.access === undefined ? encryptToken("stored-access") : o.access,
      accessTokenExpiresAt: o.expiresInMs === null ? null : new Date(Date.now() + o.expiresInMs),
    })
    .returning({ id: xAccounts.id });
  if (!row) throw new Error("seed failed");
  return row.id;
}

const load = async (db: Db, id: string) => {
  const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, id));
  if (!row) throw new Error("missing");
  return row;
};

const unauthorized = () => new AppError(ERROR_IDS.X_HTTP_FAILED, "unauthorized", { status: 401 });

describe("withAccessToken", () => {
  it("uses a valid stored token without refreshing", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, { expiresInMs: HOUR_MS });
      const seen: string[] = [];
      const r = await withAccessToken(
        db,
        fake.client,
        id,
        (t) => {
          seen.push(t);
          return Promise.resolve(ok("done"));
        },
        sig(),
      );
      expect(r).toEqual(ok("done"));
      expect(seen).toEqual(["stored-access"]);
      expect(fake.refreshCalls).toEqual([]);
    });
  });

  it("refreshes an expired token and persists the rotated refresh token", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, { expiresInMs: 30_000 });
      const seen: string[] = [];
      const r = await withAccessToken(
        db,
        fake.client,
        id,
        (t) => {
          seen.push(t);
          return Promise.resolve(ok(1));
        },
        sig(),
      );
      expect(r.ok).toBe(true);
      expect(fake.refreshCalls).toEqual(["stored-refresh"]);
      expect(seen).toEqual(["fake-access-1"]);
      const row = await load(db, id);
      expect(decryptToken(row.refreshTokenEnc as Buffer)).toEqual(ok("fake-refresh-1"));
      expect(decryptToken(row.accessTokenEnc as Buffer)).toEqual(ok("fake-access-1"));
      expect(row.accessTokenExpiresAt?.getTime()).toBeGreaterThan(Date.now() + HOUR_MS);
    });
  });

  it("refreshes when the stored access token cannot be decrypted", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, { expiresInMs: HOUR_MS, access: Buffer.from("garbage") });
      const r = await withAccessToken(db, fake.client, id, (t) => Promise.resolve(ok(t)), sig());
      expect(r).toEqual(ok("fake-access-1"));
    });
  });

  it("retries once after a 401 and then succeeds", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, { expiresInMs: HOUR_MS });
      const seen: string[] = [];
      const r = await withAccessToken(
        db,
        fake.client,
        id,
        (t) => {
          seen.push(t);
          return Promise.resolve(seen.length === 1 ? err(unauthorized()) : ok("fine"));
        },
        sig(),
      );
      expect(r).toEqual(ok("fine"));
      expect(seen).toEqual(["stored-access", "fake-access-1"]);
      expect(fake.refreshCalls).toHaveLength(1);
      expect((await load(db, id)).status).toBe("connected");
    });
  });

  it("uses the rotated refresh token when a freshly refreshed token gets a 401", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, { expiresInMs: null });
      let calls = 0;
      const r = await withAccessToken(
        db,
        fake.client,
        id,
        (t) => {
          calls += 1;
          return Promise.resolve(calls === 1 ? err(unauthorized()) : ok(t));
        },
        sig(),
      );
      expect(r).toEqual(ok("fake-access-2"));
      expect(fake.refreshCalls).toEqual(["stored-refresh", "fake-refresh-1"]);
    });
  });

  it("serializes concurrent refreshes on one expired account into a single refresh", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, { expiresInMs: null });
      const slow: XClient = {
        ...fake.client,
        refresh: async (token, s) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return fake.client.refresh(token, s);
        },
      };
      const run = () => withAccessToken(db, slow, id, (t) => Promise.resolve(ok(t)), sig());
      const [a, b] = await Promise.all([run(), run()]);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(fake.refreshCalls).toHaveLength(1);
      expect((await load(db, id)).status).toBe("connected");
    });
  });

  it("second 401 marks reconnect_required", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, { expiresInMs: HOUR_MS });
      let calls = 0;
      const r = await withAccessToken(
        db,
        fake.client,
        id,
        () => {
          calls += 1;
          return Promise.resolve(err(unauthorized()));
        },
        sig(),
      );
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_RECONNECT_REQUIRED);
      expect(calls).toBe(2);
      const row = await load(db, id);
      expect(row.status).toBe("reconnect_required");
      expect(row.lastErrorId).toBe("E_X_002");
    });
  });

  it("refresh failure marks reconnect_required", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      fake.failNext.set(
        "refresh",
        new AppError(ERROR_IDS.X_TOKEN_REFRESH_FAILED, "invalid_grant", { status: 400 }),
      );
      const id = await seedAccount(db, { expiresInMs: null });
      const r = await withAccessToken(db, fake.client, id, () => Promise.resolve(ok(1)), sig());
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_RECONNECT_REQUIRED);
      const row = await load(db, id);
      expect(row.status).toBe("reconnect_required");
      expect(row.lastErrorId).toBe("E_X_002");
    });
  });

  it("transient refresh failure leaves the account connected", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      fake.failNext.set(
        "refresh",
        new AppError(ERROR_IDS.X_HTTP_FAILED, "upstream down", { status: 503, transient: true }),
      );
      const id = await seedAccount(db, { expiresInMs: null });
      const r = await withAccessToken(db, fake.client, id, () => Promise.resolve(ok(1)), sig());
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_HTTP_FAILED);
      const row = await load(db, id);
      expect(row.status).toBe("connected");
      expect(row.lastErrorId).toBeNull();
    });
  });

  it("missing refresh token marks reconnect_required", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, { expiresInMs: null, refresh: null });
      const r = await withAccessToken(db, fake.client, id, () => Promise.resolve(ok(1)), sig());
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_RECONNECT_REQUIRED);
      expect(fake.refreshCalls).toEqual([]);
      const row = await load(db, id);
      expect(row.status).toBe("reconnect_required");
      expect(row.lastErrorId).toBe("E_X_002");
    });
  });

  it("passes a rate-limited refresh through without marking reconnect_required", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      fake.failNext.set("refresh", new AppError(ERROR_IDS.X_RATE_LIMITED, "slow down"));
      const id = await seedAccount(db, { expiresInMs: null });
      const r = await withAccessToken(db, fake.client, id, () => Promise.resolve(ok(1)), sig());
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_RATE_LIMITED);
      expect((await load(db, id)).status).toBe("connected");
    });
  });

  it("returns X_ACCOUNT_NOT_FOUND for an unknown account", async () => {
    await withTestDb(async (db) => {
      const r = await withAccessToken(
        db,
        makeXFake().client,
        "00000000-0000-0000-0000-000000000000",
        () => Promise.resolve(ok(1)),
        sig(),
      );
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_ACCOUNT_NOT_FOUND);
    });
  });
});
