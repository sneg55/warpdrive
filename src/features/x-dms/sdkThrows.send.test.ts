import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { recordKeyChanges } from "./backfill.test-helpers";
import { buildChatFixtures, type ChatFixtures } from "./eventFixtures.test-helpers";
import { SDK_SECRET, throwingDecryptFor, throwingSdkCall } from "./sdkThrows.test-helpers";
import { encryptedSetup } from "./sendEncrypted.test-helpers";
import { CONVERSATION } from "./syncSeed.test-helpers";

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const REPLY = "a reply the SDK refuses";

describe("SDK throws while sending an encrypted reply", () => {
  it.each([
    ["the usable-key check", () => throwingDecryptFor(null), false],
    ["the key change", () => throwingSdkCall("prepareConversationKeyChange"), true],
    ["the message encryption", () => throwingSdkCall("encryptMessage"), false],
  ])("returns an error value when %s throws and posts nothing", async (_l, arm, noKey) => {
    await withTestDb(async (db) => {
      const s = await encryptedSetup(db, f);
      if (noKey) s.fake.keyEvents.set(CONVERSATION, []);
      const keyChanges = recordKeyChanges(s.fake);
      arm();
      const r = await s.send(REPLY);
      expect(r.ok ? null : r.error.id).toBe(ERROR_IDS.X_CHAT_SDK_FAILED);
      expect(JSON.stringify(r.ok ? null : r.error.context)).not.toContain(SDK_SECRET);
      expect([keyChanges, s.chatSends, s.fake.sent]).toEqual([[], [], []]);
    });
  });
});
