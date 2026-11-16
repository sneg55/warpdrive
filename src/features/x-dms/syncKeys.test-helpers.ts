import type { Db } from "@/db/client";
import { xAccountChatKeys } from "@/db/schema/xDms";
import { encryptToken } from "@/features/email/crypto";
import { type ChatFixtures, FIXTURE_ME, FIXTURE_THEM } from "./eventFixtures.test-helpers";
import type { AccountChatKeys } from "./keyedParser";
import { CONVERSATION, DAY_MS, NOW_MS, seedAccount } from "./syncSeed.test-helpers";
import type { XFake } from "./xFake.test-helpers";

export const HELD_KEY_VERSION = "1700000000000";
export const ROTATED_KEY_VERSION = "1700000000002";

export async function seedChatKeys(db: Db, accountId: string, keys: AccountChatKeys) {
  for (const k of keys.keys)
    await db.insert(xAccountChatKeys).values({
      accountId,
      keyVersion: k.keyVersion,
      keysEnc: encryptToken(Buffer.from(k.blob).toString("base64")),
      unlockedAt: new Date(),
    });
}

export async function seedRawChatKey(db: Db, accountId: string, keysEnc: Buffer) {
  await db
    .insert(xAccountChatKeys)
    .values({ accountId, keyVersion: HELD_KEY_VERSION, keysEnc, unlockedAt: new Date() });
}

export function servePublicKeys(
  fake: XFake,
  f: ChatFixtures,
  o: { meVersions?: string[]; conversation?: string } = {},
) {
  const me = f.keyed.publicKeys.me.filter(
    (k) => o.meVersions === undefined || o.meVersions.includes(k.version),
  );
  fake.publicKeys.set(FIXTURE_ME, me);
  fake.publicKeys.set(FIXTURE_THEM, f.keyed.publicKeys.them);
  fake.keyEvents.set(o.conversation ?? CONVERSATION, f.keyed.keyEvents);
}

export const syncedAccount = (db: Db) =>
  seedAccount(db, { syncedAt: new Date(NOW_MS - 5 * DAY_MS) });

export async function keyedAccount(db: Db, f: ChatFixtures) {
  const accountId = await syncedAccount(db);
  await seedChatKeys(db, accountId, f.keyed.meKeys());
  return accountId;
}
