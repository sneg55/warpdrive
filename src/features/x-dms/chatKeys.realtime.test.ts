import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { encryptToken } from "@/features/email/crypto";
import { ok } from "@/types/result";
import { removeChatKeys, unlockChatKeys } from "./chatKeys";
import { fakeUnlocker, PASSCODE, publicKey, sig } from "./chatKeys.test-helpers";
import { seedXAccount, seedXConversation } from "./reads.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

const HOUR_MS = 3_600_000;

async function accountWithInbox(db: Db) {
  const admin = await seedUser(db, { isAdmin: true });
  const first = await seedUser(db);
  const second = await seedUser(db);
  const accountId = await seedXAccount(db, { members: [first.id, second.id] });
  await db
    .update(xAccounts)
    .set({
      refreshTokenEnc: encryptToken("refresh"),
      accessTokenEnc: encryptToken("access"),
      accessTokenExpiresAt: new Date(Date.now() + HOUR_MS),
    })
    .where(eq(xAccounts.id, accountId));
  await seedXConversation(db, accountId, { encrypted: true });
  await seedXConversation(db, accountId);
  return { admin, accountId, members: [first.id, second.id] };
}

const memberVersions = async (db: Db, members: string[]) =>
  (await db.execute(sql`SELECT channel, version::int FROM channel_versions ORDER BY channel`)).rows
    .map((r) => r as { channel: string; version: number })
    .filter((r) => members.some((m) => r.channel === `user:${m}`));

const expected = (members: string[]) =>
  [...members].sort().map((m) => ({ channel: `user:${m}`, version: 1 }));

describe("chat key changes publish inbox invalidations", () => {
  it("unlock publishes one update per encrypted conversation to every member", async () => {
    await withTestDb(async (db) => {
      const s = await accountWithInbox(db);
      const fake = makeXFake();
      fake.client.getPublicKeys = () => Promise.resolve(ok([publicKey("10")]));
      const r = await unlockChatKeys(
        { db, client: fake.client, unlocker: fakeUnlocker().unlocker },
        { actorId: s.admin.id, accountId: s.accountId, passcode: PASSCODE },
        sig(),
      );
      expect(r.ok).toBe(true);
      expect(await memberVersions(db, s.members)).toEqual(expected(s.members));
    });
  });

  it("remove publishes one update per encrypted conversation to every member", async () => {
    await withTestDb(async (db) => {
      const s = await accountWithInbox(db);
      const r = await removeChatKeys(db, { actorId: s.admin.id, accountId: s.accountId }, sig());
      expect(r.ok).toBe(true);
      expect(await memberVersions(db, s.members)).toEqual(expected(s.members));
    });
  });
});
