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
import { encryptedSetup, sig } from "./sendEncrypted.test-helpers";
import { runXSync } from "./sync";
import {
  HELD_KEY_VERSION,
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
import { makeXFake } from "./xFake.test-helpers";

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const keyChangeAt = (daysAgo: number) =>
  eventFrom(f.keyChange, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_ME });
const sealedAt = (daysAgo: number) =>
  eventFrom(f.encryptedMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });

describe("usable conversation key from key changes served only in data", () => {
  it("backfill decrypts with the data key change and posts no new key", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      fake.keyEvents.delete(CONVERSATION);
      const sealed = sealedAt(2);
      putConversation(fake, { events: [keyChangeAt(3), sealed] });
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      expect(row?.encrypted).toBe(true);
      await seedChatKeys(db, accountId, f.keyed.meKeys());
      const calls = recordKeyChanges(fake);
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(calls).toEqual([]);
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      const texts = (await messageRows(db, row?.id ?? "")).map((m) => [m.xEventId, m.text]);
      expect(texts).toEqual([[sealed.id, FIXTURE_TEXT]]);
    });
  });

  it("send encrypts with the data key change and posts no new key", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      s.fake.keyEvents.set(CONVERSATION, []);
      addEvents(s.fake, [keyChangeAt(3)]);
      const calls = recordKeyChanges(s.fake);
      const r = await s.send("a reply that needs no new key");
      expect(r.ok).toBe(true);
      expect(calls).toEqual([]);
      expect(s.chatSends).toHaveLength(1);
    });
  });
});
