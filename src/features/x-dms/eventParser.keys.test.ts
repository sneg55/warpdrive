import { ServerChat } from "@xdevplatform/chat-xdk-server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_TEXT,
} from "./eventFixtures.test-helpers";
import { parseChatEvents } from "./eventParser";
import {
  FIXTURE_ROTATED_TEXT,
  fixtureSigningKeys,
  openKeyring,
} from "./keyedFixtures.test-helpers";
import type { AccountChatKeys, ChatKeyring } from "./keyedParser";
import type { XSigningKey } from "./types";

let f: ChatFixtures;
let signingKeys: XSigningKey[];
const open: ChatKeyring[] = [];

beforeAll(async () => {
  f = await buildChatFixtures();
  signingKeys = fixtureSigningKeys(f.keyed);
});

afterEach(() => {
  for (const k of open.splice(0)) k.dispose();
  vi.restoreAllMocks();
});

const keyring = (keys: AccountChatKeys) => openKeyring(open, keys);

describe("parseChatEvents with a keyring", () => {
  it("still reports needsKeys for an encrypted message without one", async () => {
    const r = await parseChatEvents([f.keyChange, f.encryptedMessage]);
    expect(r.needsKeyEventIds).toEqual([f.encryptedMessage.id]);
    expect(r.nonMessageEventIds).toEqual([f.keyChange.id]);
    expect(r.encrypted).toBe(true);
  });

  it("decodes an encrypted message with the account's stored keys", async () => {
    const ring = await keyring(f.keyed.meKeys());
    const r = await parseChatEvents([f.encryptedMessage], {
      keyring: ring,
      keyEvents: f.keyed.keyEvents,
      signingKeys,
    });
    expect(r).toEqual({
      messages: [
        {
          eventId: f.encryptedMessage.id,
          senderId: FIXTURE_ME,
          text: FIXTURE_TEXT,
          hasMedia: false,
          sentAt: f.encryptedMessage.createdAt,
        },
      ],
      needsKeys: false,
      needsKeyEventIds: [],
      failedEventIds: [],
      nonMessageEventIds: [],
      encrypted: true,
    });
  });

  it("hands each instance the key events first and the participants' signing keys", async () => {
    const ring = await keyring(f.keyed.meKeys());
    const [chat] = ring.chats;
    if (chat === undefined) throw new AppError(ERROR_IDS.X_PARSE_FAILED, "no keyring instance");
    const decrypt = vi.spyOn(chat, "decryptEvents");
    await parseChatEvents([f.encryptedMessage], {
      keyring: ring,
      keyEvents: f.keyed.keyEvents,
      signingKeys,
    });
    expect(decrypt).toHaveBeenCalledWith({
      events: [...f.keyed.keyEvents, f.encryptedMessage.encodedEvent],
      signingKeys,
    });
  });

  it("leaves a message for a key version whose blob is missing in needsKeyEventIds", async () => {
    const ring = await keyring(f.keyed.meKeys());
    const r = await parseChatEvents([f.encryptedMessage, f.keyed.rotatedMessage], {
      keyring: ring,
      keyEvents: f.keyed.rotatedKeyEvents,
      signingKeys,
    });
    expect(r.messages.map((m) => m.text)).toEqual([FIXTURE_TEXT]);
    expect(r.needsKeyEventIds).toEqual([f.keyed.rotatedMessage.id]);
    expect(r.needsKeys).toBe(true);
  });

  it("decodes each event with whichever stored key version opens it", async () => {
    const ring = await keyring(f.keyed.rotatedKeys());
    const r = await parseChatEvents([f.keyed.rotatedMessage, f.encryptedMessage], {
      keyring: ring,
      keyEvents: f.keyed.rotatedKeyEvents,
      signingKeys,
    });
    expect(r.messages.map((m) => [m.eventId, m.text])).toEqual([
      [f.keyed.rotatedMessage.id, FIXTURE_ROTATED_TEXT],
      [f.encryptedMessage.id, FIXTURE_TEXT],
    ]);
    expect(r.needsKeyEventIds).toEqual([]);
  });

  it("lists read receipts, key changes and reactions as non-message events", async () => {
    const ring = await keyring(f.keyed.meKeys());
    const r = await parseChatEvents([f.readReceipt, f.keyChange, f.plaintextReaction], {
      keyring: ring,
      keyEvents: f.keyed.keyEvents,
      signingKeys,
    });
    expect(r.messages).toEqual([]);
    expect(r.nonMessageEventIds).toEqual([
      f.readReceipt.id,
      f.keyChange.id,
      f.plaintextReaction.id,
    ]);
  });

  it("maps results to raw events past key events and failures", async () => {
    const ring = await keyring(f.keyed.meKeys());
    const r = await parseChatEvents(
      [f.undecodable, f.readReceipt, f.encryptedMessage, f.plaintextMessage],
      { keyring: ring, keyEvents: f.keyed.keyEvents, signingKeys },
    );
    expect(r.failedEventIds).toEqual([f.undecodable.id]);
    expect(r.nonMessageEventIds).toEqual([f.readReceipt.id]);
    expect(r.messages.map((m) => [m.eventId, m.text])).toEqual([
      [f.encryptedMessage.id, FIXTURE_TEXT],
      [f.plaintextMessage.id, FIXTURE_TEXT],
    ]);
  });

  it("reports encrypted for a page that fully decodes but carries key events", async () => {
    const ring = await keyring(f.keyed.meKeys());
    const r = await parseChatEvents([f.plaintextMessage], {
      keyring: ring,
      keyEvents: f.keyed.keyEvents,
      signingKeys,
    });
    expect(r.needsKeys).toBe(false);
    expect(r.encrypted).toBe(true);
    expect((await parseChatEvents([f.plaintextMessage])).encrypted).toBe(false);
  });

  it("parses with today's keyless call when the keyring holds no keys", async () => {
    const ring = await keyring({ xUserId: FIXTURE_ME, keys: [] });
    const decrypt = vi.spyOn(ServerChat.prototype, "decryptEvents");
    const page = [f.plaintextMessage, f.encryptedMessage];
    const r = await parseChatEvents(page, {
      keyring: ring,
      keyEvents: f.keyed.keyEvents,
      signingKeys,
    });
    expect(decrypt.mock.calls).toEqual([
      [{ events: page.map((e) => e.encodedEvent), signingKeys: [] }],
    ]);
    expect(r.messages.map((m) => m.eventId)).toEqual([f.plaintextMessage.id]);
    expect(r.needsKeyEventIds).toEqual([f.encryptedMessage.id]);
    expect(r.encrypted).toBe(true);
  });

  it("refuses to parse with a disposed keyring", async () => {
    const ring = await keyring(f.keyed.meKeys());
    ring.dispose();
    await expect(
      parseChatEvents([f.encryptedMessage], {
        keyring: ring,
        keyEvents: f.keyed.keyEvents,
        signingKeys,
      }),
    ).rejects.toMatchObject({ id: ERROR_IDS.X_KEYRING_DISPOSED });
  });
});
