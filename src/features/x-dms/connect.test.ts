import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { xAccounts, xOAuthIntents } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { decryptToken } from "@/features/email/crypto";
import { completeXConnect } from "./connect";
import { consumeXOAuthIntent, createXOAuthIntent } from "./oauthIntent";
import type { XDmSettings } from "./settings";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const settings: XDmSettings = {
  clientId: "cid",
  clientSecret: "csecret",
  redirectUri: "https://crm.example/api/x/oauth/callback",
};

async function seedSession(db: Db, userId: string, tag: string): Promise<string> {
  const rows = await db.execute(
    sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${tag}, ${userId}, now() + interval '1 day') RETURNING id`,
  );
  return rows.rows[0]?.id as string;
}

describe("x oauth intent", () => {
  it("non-admin cannot start connect", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const sessionId = await seedSession(db, user.id, "s-na");
      const r = await createXOAuthIntent(db, { actorId: user.id, sessionId, settings }, sig());
      expect(r.ok ? null : r.error.id).toBe("E_PERM_006");
    });
  });

  it("builds a PKCE authorize url and stores the verifier", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { isAdmin: true });
      const sessionId = await seedSession(db, user.id, "s-url");
      const r = await createXOAuthIntent(db, { actorId: user.id, sessionId, settings }, sig());
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const url = new URL(r.value.authorizeUrl);
      expect(`${url.origin}${url.pathname}`).toBe("https://x.com/i/oauth2/authorize");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe("cid");
      expect(url.searchParams.get("redirect_uri")).toBe(settings.redirectUri);
      expect(url.searchParams.get("scope")).toBe(
        "dm.read dm.write tweet.read users.read offline.access",
      );
      expect(url.searchParams.get("state")).toBe(r.value.state);
      expect(r.value.state.startsWith("x.")).toBe(true);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      const [row] = await db.select().from(xOAuthIntents);
      const { createHash } = await import("node:crypto");
      const challenge = createHash("sha256")
        .update(row?.codeVerifier ?? "")
        .digest("base64url");
      expect(url.searchParams.get("code_challenge")).toBe(challenge);
      expect(Buffer.from(row?.codeVerifier ?? "", "base64url")).toHaveLength(32);
    });
  });

  it("intent is single-use and session-bound", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { isAdmin: true });
      const first = await seedSession(db, user.id, "s-1");
      const second = await seedSession(db, user.id, "s-2");
      const r = await createXOAuthIntent(
        db,
        { actorId: user.id, sessionId: first, settings },
        sig(),
      );
      if (!r.ok) throw new Error("intent failed");
      expect(await consumeXOAuthIntent(db, r.value.state, second, sig())).toBeNull();
      const got = await consumeXOAuthIntent(db, r.value.state, first, sig());
      expect(got?.codeVerifier).toBeTypeOf("string");
      expect(await consumeXOAuthIntent(db, r.value.state, first, sig())).toBeNull();
    });
  });

  it("expired intent is rejected", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { isAdmin: true });
      const sessionId = await seedSession(db, user.id, "s-exp");
      const r = await createXOAuthIntent(db, { actorId: user.id, sessionId, settings }, sig());
      if (!r.ok) throw new Error("intent failed");
      await db.update(xOAuthIntents).set({ expiresAt: new Date(Date.now() - 1000) });
      expect(await consumeXOAuthIntent(db, r.value.state, sessionId, sig())).toBeNull();
    });
  });
});

describe("completeXConnect", () => {
  const me = { id: "u-1", username: "brand", name: "Brand", profileImageUrl: null };

  it("non-admin is rejected", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const fake = makeXFake();
      fake.users.set(me.id, me);
      const r = await completeXConnect(
        db,
        fake.client,
        { actorId: user.id, code: "c", codeVerifier: "v" },
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe("E_PERM_006");
    });
  });

  it("connects, defaults the display name, and reconnect updates tokens in place", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { isAdmin: true });
      const fake = makeXFake();
      fake.users.set(me.id, me);
      const args = { actorId: user.id, code: "c", codeVerifier: "v" };
      const first = await completeXConnect(db, fake.client, args, sig());
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      await db
        .update(xAccounts)
        .set({ displayName: "Renamed", status: "reconnect_required", lastErrorId: "E_X_002" })
        .where(eq(xAccounts.id, first.value.accountId));
      fake.refreshCalls.push("bump");
      fake.users.set(me.id, { ...me, username: "brand2" });
      const again = await completeXConnect(db, fake.client, args, sig());
      expect(again).toEqual(first);
      const rows = await db.select().from(xAccounts);
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row?.displayName).toBe("Renamed");
      expect(row?.username).toBe("brand2");
      expect(row?.status).toBe("connected");
      expect(row?.lastErrorId).toBeNull();
      expect(row?.refreshTokenEnc && decryptToken(row.refreshTokenEnc)).toEqual({
        ok: true,
        value: "fake-refresh-1",
      });
      expect(row?.accessTokenEnc && decryptToken(row.accessTokenEnc)).toEqual({
        ok: true,
        value: "fake-access-1",
      });
    });
  });

  it("first connect names the account @username", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db, { isAdmin: true });
      const fake = makeXFake();
      fake.users.set(me.id, me);
      await completeXConnect(
        db,
        fake.client,
        { actorId: user.id, code: "c", codeVerifier: "v" },
        sig(),
      );
      const [row] = await db.select().from(xAccounts);
      expect(row?.displayName).toBe("@brand");
      expect(row?.connectedByUserId).toBe(user.id);
    });
  });
});
