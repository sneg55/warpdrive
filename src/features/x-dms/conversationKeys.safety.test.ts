import { ServerChat } from "@xdevplatform/chat-xdk-server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withTestDb } from "@/db/testing";
import { ok } from "@/types/result";
import { recordKeyChanges } from "./backfill.test-helpers";
import { ensureConversationKeyWith } from "./conversationKeys";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { type ChatKeyring, createChatKeyring, toSigningKeys } from "./keyedParser";
import { HELD_KEY_VERSION, syncedAccount } from "./syncKeys.test-helpers";
import { CONVERSATION } from "./syncSeed.test-helpers";
import { makeXFake, type XFake } from "./xFake.test-helpers";
import { sdkConversationId } from "./xParse";

let f: ChatFixtures;
const open: ChatKeyring[] = [];
beforeAll(async () => {
  f = await buildChatFixtures();
});

afterEach(() => {
  for (const k of open.splice(0)) k.dispose();
  vi.restoreAllMocks();
});

async function request(accountId: string, keyEvents: string[]) {
  const r = await createChatKeyring(f.keyed.meKeys());
  if (!r.ok) throw r.error;
  open.push(r.value);
  const signingMe = toSigningKeys(
    FIXTURE_ME,
    f.keyed.publicKeys.me.filter((k) => k.version === HELD_KEY_VERSION),
  );
  return {
    accountId,
    accountXUserId: FIXTURE_ME,
    xConversationId: CONVERSATION,
    participantXUserId: FIXTURE_THEM,
    keyring: r.value,
    keyEvents,
    pageEvents: [],
    signingKeys: [...signingMe, ...toSigningKeys(FIXTURE_THEM, f.keyed.publicKeys.them)],
    publicKeys: [
      ...signingMe,
      ...f.keyed.publicKeys.them.map((k) => ({
        userId: FIXTURE_THEM,
        publicKeyVersion: k.version,
        identityPublicKey: k.identityPublicKey,
      })),
    ],
  };
}

const zeroed = (bytes: Uint8Array) => bytes.length > 0 && bytes.every((b) => b === 0);

function preparedKeys() {
  const spy = vi.spyOn(ServerChat.prototype, "prepareConversationKeyChange");
  return () =>
    spy.mock.results.map((r) => (r.value as { conversationKey: Uint8Array }).conversationKey);
}

describe("sdkConversationId", () => {
  it.each([
    ["1000000000000000001-1000000000000000002", "1000000000000000001:1000000000000000002"],
    ["1000000000000000001:1000000000000000002", "1000000000000000001:1000000000000000002"],
  ])("turns %s into %s", (id, expected) => {
    expect(sdkConversationId(id)).toBe(expected);
  });
});

describe("ensureConversationKeyWith conversation ids and key bytes", () => {
  it("prepares the key change with the colon id and posts to the hyphen id", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const calls = recordKeyChanges(fake);
      const prepare = vi.spyOn(ServerChat.prototype, "prepareConversationKeyChange");
      const accountId = await syncedAccount(db);
      const r = await ensureConversationKeyWith(
        { db, client: fake.client },
        await request(accountId, []),
        new AbortController().signal,
      );
      expect(r.ok).toBe(true);
      expect(prepare.mock.calls.map(([p]) => p.conversationId)).toEqual([
        sdkConversationId(CONVERSATION),
      ]);
      expect(calls.map((c) => c.id)).toEqual([CONVERSATION]);
    });
  });

  it.each([
    [
      "the post resolves after an abort",
      (_fake: XFake, c: AbortController) => {
        c.abort();
        return Promise.resolve(ok({ conversationId: CONVERSATION, sequenceId: "1" }));
      },
    ],
    [
      "the post rejects with the abort",
      (_fake: XFake, c: AbortController) => {
        c.abort();
        return Promise.reject(c.signal.reason as Error);
      },
    ],
  ])("zeroes a created key when %s", async (_name, post) => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const controller = new AbortController();
      fake.client.addConversationKeys = () => post(fake, controller);
      const keys = preparedKeys();
      const accountId = await syncedAccount(db);
      await expect(
        ensureConversationKeyWith(
          { db, client: fake.client },
          await request(accountId, []),
          controller.signal,
        ),
      ).rejects.toThrow();
      expect(keys().map(zeroed)).toEqual([true]);
    });
  });

  it("zeroes a usable key when the run is aborted", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const decrypt = vi.spyOn(ServerChat.prototype, "decryptEvents");
      const accountId = await syncedAccount(db);
      await expect(
        ensureConversationKeyWith(
          { db, client: fake.client },
          await request(accountId, f.keyed.keyEvents),
          AbortSignal.abort(),
        ),
      ).rejects.toThrow();
      const found = decrypt.mock.results.flatMap((r) =>
        Object.values(
          (r.value as { conversationKeys: { keys: Record<string, Uint8Array> } }).conversationKeys
            .keys,
        ),
      );
      expect(found.length).toBeGreaterThan(0);
      expect(found.every(zeroed)).toBe(true);
    });
  });
});
