import { ServerChat } from "@xdevplatform/chat-xdk-server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err, ok } from "@/types/result";
import { publicKey } from "./chatKeys.test-helpers";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { runXSync } from "./sync";
import { openRunKeys } from "./syncKeys";
import {
  keyedAccount,
  ROTATED_KEY_VERSION,
  servePublicKeys,
  syncedAccount,
} from "./syncKeys.test-helpers";
import {
  accountRow,
  addEvents,
  DAY_MS,
  deps,
  eventFrom,
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;
const OTHER = "1000000000000000003";
const OTHER_CONVERSATION = `${FIXTURE_ME}-${OTHER}`;
const SECOND_THEM_CONVERSATION = `${FIXTURE_ME}-${FIXTURE_THEM}-2`;
const httpFailed = () => new AppError(ERROR_IDS.X_HTTP_FAILED, "fake failure", { status: 500 });

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const plain = (daysAgo: number, senderId: string, conversationId?: string) =>
  eventFrom(f.plaintextMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId, conversationId });

describe("runXSync public key requests", () => {
  it("makes no public key request for an account without keys", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await syncedAccount(db);
      servePublicKeys(fake, f);
      putConversation(fake, {
        events: [eventFrom(f.encryptedMessage, { at: NOW_MS - DAY_MS, senderId: FIXTURE_THEM })],
      });
      await runXSync(deps(db, fake), accountId, sig());
      expect(fake.publicKeyCalls).toEqual([]);
    });
  });

  it("asks for each participant once per run and only where keyed parsing is needed", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f);
      putConversation(fake, { events: [plain(3, FIXTURE_THEM)] });
      putConversation(fake, {
        id: SECOND_THEM_CONVERSATION,
        events: [plain(2.5, FIXTURE_THEM, SECOND_THEM_CONVERSATION)],
      });
      putConversation(fake, {
        id: OTHER_CONVERSATION,
        participantId: OTHER,
        events: [plain(2, OTHER, OTHER_CONVERSATION)],
      });
      await runXSync(deps(db, fake), accountId, sig());
      expect(fake.publicKeyCalls).toEqual([FIXTURE_ME, FIXTURE_THEM, OTHER]);
      fake.publicKeyCalls.length = 0;
      addEvents(fake, [plain(1, FIXTURE_THEM)]);
      addEvents(fake, [plain(1, OTHER, OTHER_CONVERSATION)], OTHER_CONVERSATION);
      await runXSync(deps(db, fake), accountId, sig());
      expect(fake.publicKeyCalls).toEqual([FIXTURE_ME, FIXTURE_THEM]);
    });
  });

  it("keeps the run going when the account's public keys fail", async () => {
    await withTestDb(async (db) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f);
      fake.failNext.set("getPublicKeys", httpFailed());
      putConversation(fake, { events: [plain(1, FIXTURE_THEM)] });
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 1, messages: 1 } });
      expect(logged.mock.calls).toEqual([
        ["E_X_003 x sync: chat key version refresh failed", { accountId }],
      ]);
      expect((await accountRow(db, accountId))?.chatLatestKeyVersion).toBeNull();
    });
  });

  it("keeps the run going and asks once when a participant's public keys fail", async () => {
    await withTestDb(async (db) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f);
      fake.client.getPublicKeys = (_t, userId) => {
        fake.publicKeyCalls.push(userId);
        return Promise.resolve(
          userId === FIXTURE_THEM ? err(httpFailed()) : ok(fake.publicKeys.get(userId) ?? []),
        );
      };
      putConversation(fake, { events: [plain(2, FIXTURE_THEM)] });
      putConversation(fake, {
        id: SECOND_THEM_CONVERSATION,
        events: [plain(1, FIXTURE_THEM, SECOND_THEM_CONVERSATION)],
      });
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r).toEqual({ ok: true, value: { conversations: 2, messages: 2 } });
      expect(fake.publicKeyCalls).toEqual([FIXTURE_ME, FIXTURE_THEM]);
      expect(logged.mock.calls).toEqual([
        ["E_X_003 x sync: participant public keys failed", { accountId }],
      ]);
    });
  });

  it("frees the keyring after the run, also when the run fails", async () => {
    await withTestDb(async (db) => {
      const free = vi.spyOn(ServerChat.prototype, "free");
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f);
      putConversation(fake, { events: [plain(1, FIXTURE_THEM)] });
      await runXSync(deps(db, fake), accountId, sig());
      expect(free).toHaveBeenCalledTimes(1);
      addEvents(fake, [plain(0.5, FIXTURE_THEM)]);
      fake.failNext.set("listEvents", httpFailed());
      const r = await runXSync(deps(db, fake), accountId, sig());
      expect(r.ok).toBe(false);
      expect(free).toHaveBeenCalledTimes(2);
    });
  });

  it("zeroes the loaded key blobs once the keyring is built", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const keys = f.keyed.meKeys();
      const accountId = await keyedAccount(db, f);
      servePublicKeys(fake, f);
      putConversation(fake, { events: [plain(1, FIXTURE_THEM)] });
      const fill = vi.spyOn(Uint8Array.prototype, "fill");
      await runXSync(deps(db, fake), accountId, sig());
      const blobLength = keys.keys[0]?.blob.length ?? -1;
      const zeroed = fill.mock.contexts.filter(
        (c, i) => fill.mock.calls[i]?.[0] === 0 && (c as Uint8Array).length === blobLength,
      );
      expect(zeroed).toHaveLength(1);
    });
  });
});

describe("openRunKeys chat key version", () => {
  it("stores the newest numeric version and leaves it on an empty list", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await keyedAccount(db, f);
      const account = { id: accountId, xUserId: FIXTURE_ME };
      fake.client.getPublicKeys = () =>
        Promise.resolve(ok([...f.keyed.publicKeys.me, publicKey("x")]));
      const first = await openRunKeys(deps(db, fake), account, sig());
      first?.keyring?.dispose();
      expect(first).not.toBeNull();
      expect((await accountRow(db, accountId))?.chatLatestKeyVersion).toBe(ROTATED_KEY_VERSION);
      fake.client.getPublicKeys = () => Promise.resolve(ok([]));
      const second = await openRunKeys(deps(db, fake), account, sig());
      second?.keyring?.dispose();
      expect((await accountRow(db, accountId))?.chatLatestKeyVersion).toBe(ROTATED_KEY_VERSION);
    });
  });
});
