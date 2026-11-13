import { createChat, type DecryptEventsResult } from "@xdevplatform/chat-xdk-server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_MEDIA_TEXT,
  FIXTURE_TEXT,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { isMissingConversationKey, parseChatEvents } from "./eventParser";
import type { XRawEvent } from "./types";

async function keylessDecode(events: XRawEvent[]): Promise<DecryptEventsResult> {
  const chat = await createChat();
  chat.setRejectUnverified(false);
  return chat.decryptEvents({ events: events.map((e) => e.encodedEvent), signingKeys: [] });
}

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

describe("parseChatEvents", () => {
  it("parses an unencrypted message and drops a read receipt", async () => {
    const r = await parseChatEvents([f.plaintextMessage, f.readReceipt]);
    expect(r.needsKeys).toBe(false);
    expect(r.messages).toEqual([
      {
        eventId: f.plaintextMessage.id,
        senderId: FIXTURE_THEM,
        text: FIXTURE_TEXT,
        hasMedia: false,
        sentAt: f.plaintextMessage.createdAt,
      },
    ]);
  });

  it("flags needsKeys for an encrypted message", async () => {
    const r = await parseChatEvents([f.keyChange, f.encryptedMessage]);
    expect(r).toEqual({
      messages: [],
      needsKeys: true,
      needsKeyEventIds: [f.encryptedMessage.id],
      failedEventIds: [],
    });
  });

  it("uses a conversation the participant can read with its keys", () => {
    expect(f.readAsParticipant([f.keyChange, f.encryptedMessage])).toEqual([FIXTURE_TEXT]);
  });

  it("marks media attachments", async () => {
    const r = await parseChatEvents([f.plaintextMediaMessage]);
    expect(r.messages.map((m) => [m.text, m.hasMedia])).toEqual([[FIXTURE_MEDIA_TEXT, true]]);
  });

  it("drops reactions", async () => {
    const decoded = await keylessDecode([f.plaintextReaction]);
    expect(decoded.events.map((d) => [d.event.type, d.event.content?.contentType])).toEqual([
      ["message", "reaction"],
    ]);
    const r = await parseChatEvents([f.plaintextReaction]);
    expect(r).toEqual({ messages: [], needsKeys: false, needsKeyEventIds: [], failedEventIds: [] });
  });

  it("keeps each message tied to its own raw event when an earlier event fails", async () => {
    expect(Object.keys((await keylessDecode([f.undecodable])).errors)).toEqual(["0"]);
    const r = await parseChatEvents([
      f.undecodable,
      f.readReceipt,
      f.plaintextMediaMessage,
      f.plaintextMessage,
    ]);
    expect(r.needsKeys).toBe(false);
    expect(r.messages.map((m) => [m.eventId, m.text])).toEqual([
      [f.plaintextMediaMessage.id, FIXTURE_MEDIA_TEXT],
      [f.plaintextMessage.id, FIXTURE_TEXT],
    ]);
  });

  it("returns nothing for no events", async () => {
    expect(await parseChatEvents([])).toEqual({
      messages: [],
      needsKeys: false,
      needsKeyEventIds: [],
      failedEventIds: [],
    });
  });

  it("counts events that failed for reasons other than missing keys", async () => {
    const r = await parseChatEvents([f.undecodable, f.plaintextMessage, f.encryptedMessage]);
    expect(r.failedEventIds).toEqual([f.undecodable.id]);
    expect(r.needsKeyEventIds).toEqual([f.encryptedMessage.id]);
  });
});

describe("isMissingConversationKey", () => {
  it("does not treat a signature failure as a missing key", () => {
    expect(f.signatureError).toMatch(/Signature verification failed/);
    expect(isMissingConversationKey(f.signatureError)).toBe(false);
  });
});
