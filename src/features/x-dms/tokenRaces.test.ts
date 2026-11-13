import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { encryptToken } from "@/features/email/crypto";
import { err, ok } from "@/types/result";
import { disconnectXAccount } from "./accountAdmin";
import { withAccessToken } from "./tokens";
import type { XClient } from "./types";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const HOUR_MS = 3_600_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const unauthorized = () => new AppError(ERROR_IDS.X_HTTP_FAILED, "unauthorized", { status: 401 });

async function seedAccount(db: Db, expiresInMs: number | null): Promise<string> {
  const [row] = await db
    .insert(xAccounts)
    .values({
      xUserId: `x-${Math.random().toString(36).slice(2)}`,
      username: "acct",
      displayName: "Acct",
      refreshTokenEnc: encryptToken("stored-refresh"),
      accessTokenEnc: encryptToken("stored-access"),
      accessTokenExpiresAt: expiresInMs === null ? null : new Date(Date.now() + expiresInMs),
    })
    .returning({ id: xAccounts.id });
  if (!row) throw new Error("seed failed");
  return row.id;
}

describe("token races", () => {
  it("disconnect waits for an in-flight refresh and revokes the rotated token", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const admin = await seedUser(db, { isAdmin: true });
      const id = await seedAccount(db, null);
      const slow: XClient = {
        ...fake.client,
        refresh: async (token, s) => {
          await sleep(300);
          return fake.client.refresh(token, s);
        },
      };
      const refreshing = withAccessToken(db, slow, id, (t) => Promise.resolve(ok(t)), sig());
      await sleep(100);
      const disconnected = await disconnectXAccount(
        db,
        fake.client,
        { actorId: admin.id, accountId: id },
        sig(),
      );
      await refreshing;
      expect(disconnected.ok).toBe(true);
      expect(fake.revoked).toEqual(["fake-refresh-1"]);
      expect(await db.select().from(xAccounts).where(eq(xAccounts.id, id))).toHaveLength(0);
    });
  });

  it("a stale second 401 does not overwrite an account reconnected meanwhile", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const id = await seedAccount(db, HOUR_MS);
      let calls = 0;
      const r = await withAccessToken(
        db,
        fake.client,
        id,
        async () => {
          calls += 1;
          if (calls === 2) {
            await db
              .update(xAccounts)
              .set({
                accessTokenEnc: encryptToken("reconnected-access"),
                refreshTokenEnc: encryptToken("reconnected-refresh"),
                accessTokenExpiresAt: new Date(Date.now() + HOUR_MS),
                status: "connected",
                lastErrorId: null,
              })
              .where(eq(xAccounts.id, id));
          }
          return err(unauthorized());
        },
        sig(),
      );
      expect(r.ok).toBe(false);
      const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, id));
      expect(row?.status).toBe("connected");
      expect(row?.lastErrorId).toBeNull();
    });
  });
});
