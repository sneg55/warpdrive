import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccountMembers } from "@/db/schema/xDms";
import { seedUser } from "@/db/testing/factories";
import {
  FIXTURE_CONVERSATION,
  FIXTURE_ME,
  FIXTURE_THEM,
  stringField,
} from "./eventEnvelope.test-helpers";
import type { ChatFixtures } from "./eventFixtures.test-helpers";
import { fixtureSigningKeys } from "./keyedFixtures.test-helpers";
import { createChatKeyring } from "./keyedParser";
import { sendXReply } from "./send";
import { runXSync } from "./sync";
import { HELD_KEY_VERSION, keyedAccount, servePublicKeys } from "./syncKeys.test-helpers";
import {
  CONVERSATION,
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  NOW_MS,
  putConversation,
} from "./syncSeed.test-helpers";
import type { XClient, XRawEvent, XSigningKey } from "./types";
import { makeXFake, type XFake } from "./xFake.test-helpers";

export const sig = () => new AbortController().signal;

type ChatBody = Parameters<XClient["sendChatMessage"]>[2];

export interface ChatSend {
  conversationId: string;
  body: ChatBody;
}

const THRIFT_STRUCT = 12;
const THRIFT_STOP = 0;
const EVENT_SEQUENCE_ID = 1;
const EVENT_MESSAGE_ID = 2;
const EVENT_SENDER_ID = 3;
const EVENT_CONVERSATION_ID = 4;
const EVENT_DETAIL = 7;
const DETAIL_MESSAGE_CREATE = 1;
const EVENT_SIGNATURE = 9;

export function present<T>(v: T | undefined): T {
  if (v === undefined) throw new AppError(ERROR_IDS.X_PARSE_FAILED, "an expected value is missing");
  return v;
}

const structHeader = (id: number) => Buffer.from([THRIFT_STRUCT, 0, id]);

export function recordChatSends(fake: XFake): ChatSend[] {
  const calls: ChatSend[] = [];
  const inner = fake.client;
  fake.client = {
    ...inner,
    sendChatMessage: (t, conversationId, body, s) => {
      calls.push({ conversationId, body });
      return inner.sendChatMessage(t, conversationId, body, s);
    },
  };
  return calls;
}

export function sentEvent(send: ChatSend, eventId: string): XRawEvent {
  const encoded = Buffer.concat([
    stringField(EVENT_SEQUENCE_ID, eventId),
    stringField(EVENT_MESSAGE_ID, send.body.messageId),
    stringField(EVENT_SENDER_ID, FIXTURE_ME),
    stringField(EVENT_CONVERSATION_ID, FIXTURE_CONVERSATION),
    structHeader(EVENT_DETAIL),
    structHeader(DETAIL_MESSAGE_CREATE),
    Buffer.from(send.body.encodedMessageCreateEvent, "base64"),
    Buffer.from([THRIFT_STOP]),
    structHeader(EVENT_SIGNATURE),
    Buffer.from(send.body.encodedMessageEventSignature, "base64"),
    Buffer.from([THRIFT_STOP]),
  ]).toString("base64");
  return {
    id: eventId,
    conversationId: CONVERSATION,
    senderId: FIXTURE_ME,
    createdAt: new Date(NOW_MS),
    isTrusted: true,
    encodedEvent: encoded,
  };
}

export const asKeyEvent = (encodedEvent: string, id: string): XRawEvent => ({
  id,
  conversationId: CONVERSATION,
  senderId: FIXTURE_ME,
  createdAt: new Date(NOW_MS),
  isTrusted: true,
  encodedEvent,
});

export async function verifiedTexts(
  f: ChatFixtures,
  events: string[],
  signingKeys: XSigningKey[] = fixtureSigningKeys(f.keyed),
) {
  const keyring = await createChatKeyring(f.keyed.meKeys());
  if (!keyring.ok) throw keyring.error;
  try {
    const chat = present(keyring.value.chats[0]);
    chat.setRejectUnverified(true);
    const r = chat.decryptEvents({ events, signingKeys });
    return {
      errors: Object.values(r.errors),
      texts: r.events.flatMap((d) =>
        typeof d.event.content?.text === "string" ? [d.event.content.text] : [],
      ),
    };
  } finally {
    keyring.value.dispose();
  }
}

export async function encryptedSetup(db: Db, f: ChatFixtures, o: { meVersions?: string[] } = {}) {
  const fake = makeXFake();
  const accountId = await keyedAccount(db, f);
  servePublicKeys(fake, f, { meVersions: o.meVersions ?? [HELD_KEY_VERSION] });
  putConversation(fake, {
    events: [eventFrom(f.encryptedMessage, { at: NOW_MS - DAY_MS, senderId: FIXTURE_THEM })],
  });
  const synced = await runXSync(deps(db, fake), accountId, sig());
  if (!synced.ok) throw synced.error;
  const row = await conversationRow(db, accountId);
  if (row === undefined)
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "the sync stored no conversation");
  const member = await seedUser(db);
  await db.insert(xAccountMembers).values({ accountId, userId: member.id });
  fake.sendAtMs = Date.now();
  const chatSends = recordChatSends(fake);
  const send = (text: string, signal: AbortSignal = sig()) =>
    sendXReply(
      { db, client: fake.client },
      { actorId: member.id, conversationId: row.id, text },
      signal,
    );
  return { fake, accountId, member, conversation: row, chatSends, send };
}
