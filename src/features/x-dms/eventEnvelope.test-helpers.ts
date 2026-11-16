import type { ActionSignature } from "@xdevplatform/chat-xdk-server";
import { X_SNOWFLAKE_EPOCH_MS } from "@/constants/xDms";
import type { XRawEvent } from "./types";

export const FIXTURE_ME = "1000000000000000001";
export const FIXTURE_THEM = "1000000000000000002";
export const FIXTURE_CONVERSATION = `${FIXTURE_ME}:${FIXTURE_THEM}`;

const FIXTURE_BASE_MS = Date.UTC(2026, 0, 1);
const THRIFT_STOP = 0;
export const THRIFT_STRING = 11;
const THRIFT_STRUCT = 12;
const EVENT_SEQUENCE_ID = 1;
const EVENT_MESSAGE_ID = 2;
const EVENT_SENDER_ID = 3;
const EVENT_CONVERSATION_ID = 4;
const EVENT_DETAIL = 7;
const EVENT_SIGNATURE = 9;
const SIGNATURE_VALUE = 1;
const SIGNATURE_PUBLIC_KEY_VERSION = 2;
const SIGNATURE_VERSION = 3;
export const DETAIL_MESSAGE_CREATE = 1;
export const MESSAGE_CREATE_CONTENTS = 100;

function header(type: number, id: number): Buffer {
  const h = Buffer.alloc(3);
  h[0] = type;
  h.writeInt16BE(id, 1);
  return h;
}

export function stringField(id: number, value: Buffer | string): Buffer {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  const len = Buffer.alloc(4);
  len.writeInt32BE(bytes.length);
  return Buffer.concat([header(THRIFT_STRING, id), len, bytes]);
}

export function structField(id: number, body: Buffer): Buffer {
  return Buffer.concat([header(THRIFT_STRUCT, id), body, Buffer.from([THRIFT_STOP])]);
}

function envelope(a: {
  seq: number;
  messageId: string;
  senderId: string;
  detail: Buffer;
  conversationId?: string;
}): Buffer {
  return Buffer.concat([
    stringField(EVENT_SEQUENCE_ID, String(a.seq)),
    stringField(EVENT_MESSAGE_ID, a.messageId),
    stringField(EVENT_SENDER_ID, a.senderId),
    stringField(EVENT_CONVERSATION_ID, a.conversationId ?? FIXTURE_CONVERSATION),
    a.detail,
  ]);
}

export function plainEnvelope(a: {
  seq: number;
  messageId: string;
  senderId: string;
  detail: Buffer;
}): string {
  return Buffer.concat([
    envelope({ ...a, detail: structField(EVENT_DETAIL, a.detail) }),
    Buffer.from([THRIFT_STOP]),
  ]).toString("base64");
}

export function signedEnvelope(
  seq: number,
  senderId: string,
  action: ActionSignature,
  conversationId: string = FIXTURE_CONVERSATION,
): string {
  const s = action.messageEventSignature;
  return Buffer.concat([
    envelope({
      seq,
      messageId: action.messageId,
      senderId,
      conversationId,
      detail: Buffer.concat([
        header(THRIFT_STRUCT, EVENT_DETAIL),
        Buffer.from(action.encodedMessageEventDetail, "base64"),
      ]),
    }),
    structField(
      EVENT_SIGNATURE,
      Buffer.concat([
        stringField(SIGNATURE_VALUE, s.signature),
        stringField(SIGNATURE_PUBLIC_KEY_VERSION, s.publicKeyVersion),
        stringField(SIGNATURE_VERSION, s.signatureVersion),
      ]),
    ),
    Buffer.from([THRIFT_STOP]),
  ]).toString("base64");
}

export function rawEvent(seq: number, senderId: string, encodedEvent: string): XRawEvent {
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
