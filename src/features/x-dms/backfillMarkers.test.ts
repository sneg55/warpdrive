import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { runXChatBackfill } from "./backfill";
import { recordKeyChanges, setBackfilled } from "./backfill.test-helpers";
import { removeChatKeys } from "./chatKeys";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_TEXT,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { sig } from "./sendEncrypted.test-helpers";
import { runXSync } from "./sync";
import {
  HELD_KEY_VERSION,
  keyedAccount,
  seedChatKeys,
  servePublicKeys,
  syncedAccount,
} from "./syncKeys.test-helpers";
import {
  addEvents,
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  messageRows,
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const sealedAt = (daysAgo: number) =>
  eventFrom(f.encryptedMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });

function served() {
  const fake = makeXFake();
  servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
  putConversation(fake, { events: [sealedAt(3)] });
  return fake;
}

async function remove(db: Db, accountId: string) {
  const admin = await seedUser(db, { isAdmin: true });
  const r = await removeChatKeys(db, { actorId: admin.id, accountId }, sig());
  if (!r.ok) throw r.error;
}

describe("backfill markers after keys go away", () => {
  it("removing the keys clears the account's backfill markers", async () => {
    await withTestDb(async (db) => {
      const fake = served();
      const accountId = await keyedAccount(db, f);
      await runXSync(deps(db, fake), accountId, sig());
      await setBackfilled(db, accountId, HELD_KEY_VERSION);
      await remove(db, accountId);
      expect((await conversationRow(db, accountId))?.backfilledKeyVersion).toBeNull();
    });
  });

  it("a locked sync that stores placeholders clears the marker", async () => {
    await withTestDb(async (db) => {
      const fake = served();
      const accountId = await syncedAccount(db);
      await runXSync(deps(db, fake), accountId, sig());
      await setBackfilled(db, accountId, HELD_KEY_VERSION);
      addEvents(fake, [sealedAt(1)]);
      await runXSync(deps(db, fake), accountId, sig());
      expect((await conversationRow(db, accountId))?.backfilledKeyVersion).toBeNull();
    });
  });

  it("unlocking the same version again backfills messages synced while locked", async () => {
    await withTestDb(async (db) => {
      const fake = served();
      recordKeyChanges(fake);
      const accountId = await keyedAccount(db, f);
      await runXSync(deps(db, fake), accountId, sig());
      await runXChatBackfill(deps(db, fake), accountId, sig());
      expect((await conversationRow(db, accountId))?.backfilledKeyVersion).toBe(HELD_KEY_VERSION);
      await remove(db, accountId);
      addEvents(fake, [sealedAt(1)]);
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      expect((await messageRows(db, row?.id ?? "")).map((m) => m.text)).toEqual([FIXTURE_TEXT, ""]);
      await seedChatKeys(db, accountId, f.keyed.meKeys());
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      const texts = (await messageRows(db, row?.id ?? "")).map((m) => m.text);
      expect(texts).toEqual([FIXTURE_TEXT, FIXTURE_TEXT]);
    });
  });
});
