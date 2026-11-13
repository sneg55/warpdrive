import { createChat, type Event, type ServerChat } from "@xdevplatform/chat-xdk-server";
import type { XRawEvent } from "./types";

export interface ParsedChatMessage {
  eventId: string;
  senderId: string;
  text: string;
  hasMedia: boolean;
  sentAt: Date;
}

export interface ParsedChatEvents {
  messages: ParsedChatMessage[];
  needsKeys: boolean;
  needsKeyEventIds: string[];
  failedEventIds: string[];
}

const MISSING_CONVERSATION_KEY = "but no matching key found";

let chat: Promise<ServerChat> | null = null;

function keylessChat(): Promise<ServerChat> {
  chat ??= createChat().then(
    (c) => {
      c.setRejectUnverified(false);
      return c;
    },
    (e: unknown) => {
      chat = null;
      throw e;
    },
  );
  return chat;
}

export function isMissingConversationKey(error: string): boolean {
  return error.includes(MISSING_CONVERSATION_KEY);
}

function toMessage(raw: XRawEvent, event: Event): ParsedChatMessage | null {
  const text: unknown = event.content?.text;
  if (event.type !== "message" || typeof text !== "string") return null;
  const hasMedia = (event.attachments ?? []).some((a) => a.attachmentType === "media");
  return { eventId: raw.id, senderId: raw.senderId, text, hasMedia, sentAt: raw.createdAt };
}

export async function parseChatEvents(raw: XRawEvent[]): Promise<ParsedChatEvents> {
  if (raw.length === 0)
    return { messages: [], needsKeys: false, needsKeyEventIds: [], failedEventIds: [] };
  const sdk = await keylessChat();
  const result = sdk.decryptEvents({ events: raw.map((e) => e.encodedEvent), signingKeys: [] });
  const messages: ParsedChatMessage[] = [];
  const needsKeyEventIds: string[] = [];
  const failedEventIds: string[] = [];
  let next = 0;
  raw.forEach((r, i) => {
    const error = result.errors[String(i)];
    if (error !== undefined) {
      if (isMissingConversationKey(error)) needsKeyEventIds.push(r.id);
      else failedEventIds.push(r.id);
      return;
    }
    const decoded = result.events[next++];
    const message = decoded === undefined ? null : toMessage(r, decoded.event);
    if (message !== null) messages.push(message);
  });
  return { messages, needsKeys: needsKeyEventIds.length > 0, needsKeyEventIds, failedEventIds };
}
