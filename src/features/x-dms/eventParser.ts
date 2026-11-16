import { createChat, type Event, type ServerChat } from "@xdevplatform/chat-xdk-server";
import { type ChatKeyring, type DecodeOutcome, decodeWith, liveChats } from "./keyedParser";
import type { XRawEvent, XSigningKey } from "./types";

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
  nonMessageEventIds: string[];
  encrypted: boolean;
}

export interface KeyedParseOptions {
  keyring: ChatKeyring;
  keyEvents: string[];
  contextEvents?: string[];
  signingKeys: XSigningKey[];
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

function merge(outcomes: DecodeOutcome[]): DecodeOutcome {
  const decoded = outcomes.find((o) => "event" in o);
  if (decoded !== undefined) return decoded;
  const errors = outcomes.flatMap((o) => ("error" in o ? [o.error] : []));
  return { error: errors.find((e) => !isMissingConversationKey(e)) ?? errors[0] ?? "" };
}

async function decodeAll(raw: XRawEvent[], opts?: KeyedParseOptions): Promise<DecodeOutcome[]> {
  const encoded = raw.map((e) => e.encodedEvent);
  const chats = opts === undefined ? [] : liveChats(opts.keyring);
  const perChat =
    opts === undefined || chats.length === 0
      ? [decodeWith(await keylessChat(), [], encoded, [])]
      : chats.map((c) =>
          decodeWith(
            c,
            [...opts.keyEvents, ...(opts.contextEvents ?? [])],
            encoded,
            opts.signingKeys,
          ),
        );
  return raw.map((_, i) => merge(perChat.flatMap((p) => p[i] ?? [])));
}

export async function parseChatEvents(
  raw: XRawEvent[],
  opts?: KeyedParseOptions,
): Promise<ParsedChatEvents> {
  const parsed: ParsedChatEvents = {
    messages: [],
    needsKeys: false,
    needsKeyEventIds: [],
    failedEventIds: [],
    nonMessageEventIds: [],
    encrypted: (opts?.keyEvents.length ?? 0) > 0,
  };
  if (raw.length === 0) return parsed;
  const outcomes = await decodeAll(raw, opts);
  raw.forEach((r, i) => {
    const o = outcomes[i];
    if (o === undefined) return;
    if ("error" in o) {
      if (isMissingConversationKey(o.error)) parsed.needsKeyEventIds.push(r.id);
      else parsed.failedEventIds.push(r.id);
      return;
    }
    if (o.event.type === "keyChange") parsed.encrypted = true;
    const message = toMessage(r, o.event);
    if (message === null) parsed.nonMessageEventIds.push(r.id);
    else parsed.messages.push(message);
  });
  parsed.needsKeys = parsed.needsKeyEventIds.length > 0;
  if (parsed.needsKeys) parsed.encrypted = true;
  return parsed;
}
