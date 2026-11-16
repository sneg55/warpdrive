import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { runXChatBackfill } from "./backfill";
import {
  buildLostKeyConversation,
  LOST_CONVERSATION,
  type LostKeyConversation,
  OTHER,
  recordKeyChanges,
  serveLostKeyConversation,
} from "./backfill.test-helpers";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_TEXT,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { SDK_SECRET, throwingDecryptFor } from "./sdkThrows.test-helpers";
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
let lost: LostKeyConversation;
beforeAll(async () => {
  f = await buildChatFixtures();
  lost = await buildLostKeyConversation();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sealedAt = (daysAgo: number) =>
  eventFrom(f.encryptedMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });
const lostAt = (daysAgo: number) =>
  eventFrom(lost.message, {
    at: NOW_MS - daysAgo * DAY_MS,
    senderId: OTHER,
    conversationId: LOST_CONVERSATION,
  });

function twoConversations(o: { lostDaysAgo: number; sealedDaysAgo: number }) {
  const fake = makeXFake();
  servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
  serveLostKeyConversation(fake, lost);
  putConversation(fake, { events: [sealedAt(o.sealedDaysAgo)] });
  putConversation(fake, {
    id: LOST_CONVERSATION,
    participantId: OTHER,
    events: [lostAt(o.lostDaysAgo)],
  });
  return fake;
}

const textsOf = async (db: Parameters<typeof messageRows>[0], accountId: string, id?: string) =>
  (await messageRows(db, (await conversationRow(db, accountId, id))?.id ?? "")).map((m) => m.text);

describe("SDK throws during decryption", () => {
  it("a throwing decrypt in the first conversation still syncs the next one", async () => {
    await withTestDb(async (db) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const fake = twoConversations({ lostDaysAgo: 3, sealedDaysAgo: 1 });
      const accountId = await keyedAccount(db, f);
      throwingDecryptFor(lost.message.encodedEvent);
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 2, messages: 2 } });
      expect(await textsOf(db, accountId)).toEqual([FIXTURE_TEXT]);
      expect(await textsOf(db, accountId, LOST_CONVERSATION)).toEqual([""]);
    });
  });

  it("backfill marks the throwing conversation done, posts no key and continues", async () => {
    await withTestDb(async (db) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fake = twoConversations({ lostDaysAgo: 1, sealedDaysAgo: 2 });
      const accountId = await syncedAccount(db);
      await runXSync(deps(db, fake), accountId, sig());
      await seedChatKeys(db, accountId, f.keyed.meKeys());
      const calls = recordKeyChanges(fake);
      throwingDecryptFor(lost.message.encodedEvent);
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, keysCreated: 0 } });
      expect(calls).toEqual([]);
      const lostRow = await conversationRow(db, accountId, LOST_CONVERSATION);
      expect(lostRow?.backfilledKeyVersion).toBe(HELD_KEY_VERSION);
      expect(await textsOf(db, accountId)).toEqual([FIXTURE_TEXT]);
      const lines = logged.mock.calls.map((c) => JSON.stringify(c));
      expect(lines.some((l) => l.includes(ERROR_IDS.X_CHAT_SDK_FAILED))).toBe(true);
      expect(lines.some((l) => l.includes(SDK_SECRET))).toBe(false);
    });
  });
});
