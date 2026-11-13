import { createChat, type SendPayload, type ServerChat } from "@xdevplatform/chat-xdk-server";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { X_SNOWFLAKE_EPOCH_MS } from "@/constants/xDms";
import type { XRawEvent } from "./types";

export const FIXTURE_ME = "1000000000000000001";
export const FIXTURE_THEM = "1000000000000000002";
export const FIXTURE_CONVERSATION = `${FIXTURE_ME}:${FIXTURE_THEM}`;
export const FIXTURE_TEXT = "hello from a generated fixture";
export const FIXTURE_MEDIA_TEXT = "see the attached picture";

const ME_KEY_VERSION = "1700000000000";
const THEM_KEY_VERSION = "1700000000001";
const FIXTURE_BASE_MS = Date.UTC(2026, 0, 1);

const THRIFT_STOP = 0;
const THRIFT_STRING = 11;
const THRIFT_STRUCT = 12;
const EVENT_SEQUENCE_ID = 1;
const EVENT_MESSAGE_ID = 2;
const EVENT_SENDER_ID = 3;
const EVENT_CONVERSATION_ID = 4;
const EVENT_DETAIL = 7;
const DETAIL_MESSAGE_CREATE = 1;
const MESSAGE_CREATE_CONTENTS = 100;

export interface ChatFixtures {
  plaintextMessage: XRawEvent;
  plaintextMediaMessage: XRawEvent;
  plaintextReaction: XRawEvent;
  readReceipt: XRawEvent;
  keyChange: XRawEvent;
  encryptedMessage: XRawEvent;
  undecodable: XRawEvent;
  signatureError: string;
  readAsParticipant(events: XRawEvent[]): string[];
}

function header(type: number, id: number): Buffer {
  const h = Buffer.alloc(3);
  h[0] = type;
  h.writeInt16BE(id, 1);
  return h;
}

function stringField(id: number, value: Buffer | string): Buffer {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  const len = Buffer.alloc(4);
  len.writeInt32BE(bytes.length);
  return Buffer.concat([header(THRIFT_STRING, id), len, bytes]);
}

function structField(id: number, body: Buffer): Buffer {
  return Buffer.concat([header(THRIFT_STRUCT, id), body, Buffer.from([THRIFT_STOP])]);
}

function envelope(a: { seq: number; messageId: string; senderId: string; detail: Buffer }): string {
  return Buffer.concat([
    stringField(EVENT_SEQUENCE_ID, String(a.seq)),
    stringField(EVENT_MESSAGE_ID, a.messageId),
    stringField(EVENT_SENDER_ID, a.senderId),
    stringField(EVENT_CONVERSATION_ID, FIXTURE_CONVERSATION),
    structField(EVENT_DETAIL, a.detail),
    Buffer.from([THRIFT_STOP]),
  ]).toString("base64");
}

function rawEvent(seq: number, senderId: string, encodedEvent: string): XRawEvent {
  const createdAt = new Date(FIXTURE_BASE_MS + seq * 60_000);
  const id = ((BigInt(createdAt.getTime() - X_SNOWFLAKE_EPOCH_MS) << 22n) | BigInt(seq)).toString();
  return {
    id,
    conversationId: FIXTURE_CONVERSATION,
    senderId,
    createdAt,
    isTrusted: true,
    encodedEvent,
  };
}

function plaintextContents(chat: ServerChat, key: Uint8Array, payload: SendPayload): Buffer {
  const create = Buffer.from(payload.encodedMessageCreateEvent, "base64");
  if (create[0] !== THRIFT_STRING || create.readInt16BE(1) !== MESSAGE_CREATE_CONTENTS) {
    throw new AppError(ERROR_IDS.X_PARSE_FAILED, "unexpected MessageCreateEvent layout");
  }
  const ciphertext = create.subarray(7, 7 + create.readInt32BE(3)).toString("base64");
  return Buffer.from(chat.decrypt(ciphertext, key), "utf8");
}

async function identity(userId: string, signingKeyVersion: string) {
  const chat = await createChat();
  const registration = chat.generateKeypairs().publicKey;
  chat.setIdentity({ userId, signingKeyVersion });
  return { chat, registration, userId, signingKeyVersion };
}

export async function buildChatFixtures(): Promise<ChatFixtures> {
  const me = await identity(FIXTURE_ME, ME_KEY_VERSION);
  const them = await identity(FIXTURE_THEM, THEM_KEY_VERSION);
  const change = me.chat.prepareConversationKeyChange({
    conversationId: FIXTURE_CONVERSATION,
    publicKeys: [me, them].map((p) => ({
      userId: p.userId,
      identityPublicKey: p.registration.publicKey,
      publicKeyVersion: p.signingKeyVersion,
    })),
  });
  const key = {
    conversationKey: change.conversationKey,
    conversationKeyVersion: change.conversationKeyVersion,
  };
  const encrypt = (text: string, withMedia: boolean): SendPayload =>
    me.chat.encryptMessage({
      conversationId: FIXTURE_CONVERSATION,
      text,
      ...key,
      attachments: withMedia
        ? [
            {
              attachment_type: "media",
              media_hash_key: "fixture-media",
              width: 10,
              height: 10,
              filesize_bytes: 100,
              filename: "a.png",
            },
          ]
        : null,
    });
  const asPlaintext = (seq: number, payload: SendPayload): XRawEvent =>
    rawEvent(
      seq,
      FIXTURE_THEM,
      envelope({
        seq,
        messageId: payload.messageId,
        senderId: FIXTURE_THEM,
        detail: structField(
          DETAIL_MESSAGE_CREATE,
          stringField(
            MESSAGE_CREATE_CONTENTS,
            plaintextContents(me.chat, change.conversationKey, payload),
          ),
        ),
      }),
    );
  const signed = (
    seq: number,
    senderId: string,
    action: { messageId: string; encodedMessageEventDetail: string },
  ) =>
    rawEvent(
      seq,
      senderId,
      envelope({
        seq,
        messageId: action.messageId,
        senderId,
        detail: Buffer.from(action.encodedMessageEventDetail, "base64"),
      }),
    );

  const receipt = them.chat.prepareMarkConversationRead({
    conversationId: FIXTURE_CONVERSATION,
    seenUntilSequenceId: "1",
  });
  const readReceipt = signed(4, FIXTURE_THEM, receipt.actionSignatures[0] ?? missing());
  const keyChange = signed(5, FIXTURE_ME, change.actionSignatures[0] ?? missing());
  const encryptedMessage = rawEvent(6, FIXTURE_ME, encrypt(FIXTURE_TEXT, false).eventB64);
  const reaction = me.chat.encryptAddReaction({
    emoji: "+",
    conversationId: FIXTURE_CONVERSATION,
    targetMessageSequenceId: "1",
    ...key,
  });

  const strict = await createChat();
  const strictResult = strict.decryptEvents({
    events: [readReceipt.encodedEvent],
    signingKeys: [],
  });
  const reader = await createChat();
  reader.importKeys({ keys: them.chat.exportKeys(), signingKeyVersion: THEM_KEY_VERSION });
  reader.setIdentity({ userId: FIXTURE_THEM, signingKeyVersion: THEM_KEY_VERSION });
  reader.setRejectUnverified(false);

  return {
    plaintextMessage: asPlaintext(1, encrypt(FIXTURE_TEXT, false)),
    plaintextMediaMessage: asPlaintext(2, encrypt(FIXTURE_MEDIA_TEXT, true)),
    plaintextReaction: asPlaintext(3, reaction),
    readReceipt,
    keyChange,
    encryptedMessage,
    undecodable: rawEvent(7, FIXTURE_THEM, Buffer.from("not a thrift event").toString("base64")),
    signatureError: strictResult.errors["0"] ?? missing(),
    readAsParticipant: (events) =>
      reader
        .decryptEvents({ events: events.map((e) => e.encodedEvent), signingKeys: [] })
        .events.flatMap((d) =>
          typeof d.event.content?.text === "string" ? [d.event.content.text] : [],
        ),
  };
}

function missing(): never {
  throw new AppError(ERROR_IDS.X_PARSE_FAILED, "the SDK did not return the expected fixture part");
}
