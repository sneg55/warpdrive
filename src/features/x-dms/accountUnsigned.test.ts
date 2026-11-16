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
import { buildChatFixtures, type ChatFixtures, FIXTURE_ME } from "./eventFixtures.test-helpers";
import { encryptedSetup, sig } from "./sendEncrypted.test-helpers";
import { runXSync } from "./sync";
import {
  HELD_KEY_VERSION,
  seedChatKeys,
  servePublicKeys,
  syncedAccount,
} from "./syncKeys.test-helpers";
import {
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import { makeXFake, type XFake } from "./xFake.test-helpers";

let f: ChatFixtures;
let lost: LostKeyConversation;
beforeAll(async () => {
  f = await buildChatFixtures();
  lost = await buildLostKeyConversation();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function unsignAccountKey(fake: XFake) {
  fake.publicKeys.set(
    FIXTURE_ME,
    f.keyed.publicKeys.me
      .filter((k) => k.version === HELD_KEY_VERSION)
      .map((k) => ({ ...k, identityPublicKeySignature: null })),
  );
}

describe("account's newest public key without an identity signature", () => {
  it("send refuses with E_X_014 before any key change or message post", async () => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      unsignAccountKey(s.fake);
      const keyChanges = recordKeyChanges(s.fake);
      const r = await s.send("a reply that must not go out");
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_CHAT_KEYS_STALE);
      expect([keyChanges, s.chatSends, s.fake.sent]).toEqual([[], [], []]);
    });
  });

  it("backfill stops the run with E_X_014, posts nothing and leaves the conversation unmarked", async () => {
    await withTestDb(async (db) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fake = makeXFake();
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f, { meVersions: [HELD_KEY_VERSION] });
      serveLostKeyConversation(fake, lost);
      putConversation(fake, {
        id: LOST_CONVERSATION,
        participantId: OTHER,
        events: [
          eventFrom(lost.message, {
            at: NOW_MS - DAY_MS,
            senderId: OTHER,
            conversationId: LOST_CONVERSATION,
          }),
        ],
      });
      await runXSync(deps(db, fake), accountId, sig());
      await seedChatKeys(db, accountId, f.keyed.meKeys());
      unsignAccountKey(fake);
      const calls = recordKeyChanges(fake);
      const r = await runXChatBackfill(deps(db, fake), accountId, sig());
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_CHAT_KEYS_STALE);
      expect(calls).toEqual([]);
      const row = await conversationRow(db, accountId, LOST_CONVERSATION);
      expect(row?.backfilledKeyVersion).toBeNull();
    });
  });
});
