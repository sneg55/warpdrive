import { beforeAll, describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { runXChatBackfill } from "./backfill";
import { recordKeyChanges } from "./backfill.test-helpers";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
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
  CONVERSATION,
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  messageRows,
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import { makeXFake, type XFake } from "./xFake.test-helpers";

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const keyChangeAt = (daysAgo: number) =>
  eventFrom(f.keyChange, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_ME });
const sealedAt = (daysAgo: number) =>
  eventFrom(f.encryptedMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });

async function backfillAfterLockedSync(db: Parameters<typeof syncedAccount>[0], fake: XFake) {
  const accountId = await syncedAccount(db);
  await runXSync(deps(db, fake), accountId, sig());
  await seedChatKeys(db, accountId, f.keyed.meKeys());
  const calls = recordKeyChanges(fake);
  const r = await runXChatBackfill(deps(db, fake), accountId, sig());
  const row = await conversationRow(db, accountId);
  const texts = (await messageRows(db, row?.id ?? "")).map((m) => m.text);
  return { r, calls, texts };
}

describe("key changes across event pages", () => {
  it("decrypts page 2 events with a key change seen in page 1's data", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      fake.keyEvents.delete(CONVERSATION);
      putConversation(fake, {
        events: [keyChangeAt(1), ...[2, 3, 4, 5, 6].map((d) => sealedAt(d))],
      });
      const { r, calls, texts } = await backfillAfterLockedSync(db, fake);
      expect(calls).toEqual([]);
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      expect(texts).toEqual(Array(5).fill(FIXTURE_TEXT));
    });
  });

  it("uses key events served in a later page's meta", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      fake.keyEvents.set(CONVERSATION, []);
      fake.laterPageKeyEvents.set(CONVERSATION, f.keyed.keyEvents);
      putConversation(fake, { events: [1, 2, 3, 4, 5, 6].map((d) => sealedAt(d)) });
      const { r, calls, texts } = await backfillAfterLockedSync(db, fake);
      expect(calls).toEqual([]);
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      expect(texts).toEqual(Array(6).fill(FIXTURE_TEXT));
    });
  });

  it("sync decrypts a new message with an older key change on the same page", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      fake.keyEvents.delete(CONVERSATION);
      putConversation(fake, { events: [keyChangeAt(3), sealedAt(2)] });
      await runXSync(deps(db, fake), accountId, sig());
      const fresh = sealedAt(1);
      addEvents(fake, [fresh]);
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      const texts = (await messageRows(db, row?.id ?? "")).map((m) => [m.xEventId, m.text]);
      expect(texts.at(-1)).toEqual([fresh.id, FIXTURE_TEXT]);
    });
  });
});
