import {
  type ActionSignature,
  createChat,
  type SendPayload,
  type ServerChat,
} from "@xdevplatform/chat-xdk-server";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  DETAIL_MESSAGE_CREATE,
  FIXTURE_CONVERSATION,
  FIXTURE_ME,
  FIXTURE_THEM,
  MESSAGE_CREATE_CONTENTS,
  plainEnvelope,
  rawEvent,
  signedEnvelope,
  stringField,
  structField,
  THRIFT_STRING,
} from "./eventEnvelope.test-helpers";
import {
  buildKeyedFixtures,
  identity,
  type KeyedFixtures,
  keyChangeFor,
} from "./keyedFixtures.test-helpers";
import type { XRawEvent } from "./types";

export { FIXTURE_CONVERSATION, FIXTURE_ME, FIXTURE_THEM } from "./eventEnvelope.test-helpers";
export const FIXTURE_TEXT = "hello from a generated fixture";
export const FIXTURE_MEDIA_TEXT = "see the attached picture";

const ME_KEY_VERSION = "1700000000000";
const THEM_KEY_VERSION = "1700000000001";

export interface ChatFixtures {
  plaintextMessage: XRawEvent;
  plaintextMediaMessage: XRawEvent;
  plaintextReaction: XRawEvent;
  readReceipt: XRawEvent;
  keyChange: XRawEvent;
  encryptedMessage: XRawEvent;
  undecodable: XRawEvent;
  signatureError: string;
  keyed: KeyedFixtures;
  readAsParticipant(events: XRawEvent[]): string[];
}

function plaintextContents(chat: ServerChat, key: Uint8Array, payload: SendPayload): Buffer {
  const create = Buffer.from(payload.encodedMessageCreateEvent, "base64");
  if (create[0] !== THRIFT_STRING || create.readInt16BE(1) !== MESSAGE_CREATE_CONTENTS) {
    throw new AppError(ERROR_IDS.X_PARSE_FAILED, "unexpected MessageCreateEvent layout");
  }
  const ciphertext = create.subarray(7, 7 + create.readInt32BE(3)).toString("base64");
  return Buffer.from(chat.decrypt(ciphertext, key), "utf8");
}

export async function buildChatFixtures(): Promise<ChatFixtures> {
  const me = await identity(FIXTURE_ME, ME_KEY_VERSION);
  const them = await identity(FIXTURE_THEM, THEM_KEY_VERSION);
  const change = keyChangeFor(me, [me, them]);
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
      plainEnvelope({
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
  const signed = (seq: number, senderId: string, action: ActionSignature) =>
    rawEvent(seq, senderId, signedEnvelope(seq, senderId, action));

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
    keyed: await buildKeyedFixtures({ me, them, change, keyChangeEvent: keyChange.encodedEvent }),
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
