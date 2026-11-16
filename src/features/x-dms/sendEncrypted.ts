import type { AppError } from "@/constants/errorIds";
import { X_FIRST_PAGE_SIZE } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { loadChatKeys } from "./chatKeys";
import { ensureConversationKey } from "./conversationKeys";
import { type ChatKeyring, createChatKeyring, liveChats, sdkFailure } from "./keyedParser";
import {
  deliveryOutcome,
  ENCRYPTED_CONVERSATION,
  inputInvalid,
  type SendTarget,
} from "./sendOutcome";
import { withAccessToken } from "./tokens";
import type { XClient } from "./types";
import { sdkConversationId } from "./xParse";

type Deps = { db: Db; client: XClient };
type ChatMessageBody = Parameters<XClient["sendChatMessage"]>[2];

async function openKeyring(
  deps: Deps,
  target: SendTarget,
  signal: AbortSignal,
): Promise<Result<ChatKeyring, AppError>> {
  const loaded = await loadChatKeys(deps.db, target.accountId, signal);
  if (!loaded.ok) return loaded;
  try {
    if (loaded.value.length === 0) return err(inputInvalid(ENCRYPTED_CONVERSATION));
    return await createChatKeyring({ xUserId: target.accountXUserId, keys: loaded.value });
  } finally {
    for (const k of loaded.value) k.blob.fill(0);
  }
}

async function encryptWith(
  deps: Deps,
  a: { target: SendTarget; keyring: ChatKeyring; text: string },
  signal: AbortSignal,
): Promise<Result<ChatMessageBody, AppError>> {
  const { target } = a;
  const page = await withAccessToken(
    deps.db,
    deps.client,
    target.accountId,
    (token) =>
      deps.client.listEvents(
        token,
        { conversationId: target.xConversationId, maxResults: X_FIRST_PAGE_SIZE },
        signal,
      ),
    signal,
  );
  signal.throwIfAborted();
  if (!page.ok) return page;
  const key = await ensureConversationKey(
    deps,
    {
      accountId: target.accountId,
      accountXUserId: target.accountXUserId,
      xConversationId: target.xConversationId,
      participantXUserId: target.participantXUserId,
      keyring: a.keyring,
      keyEvents: page.value.keyEvents,
      pageEvents: page.value.items.map((e) => e.encodedEvent),
    },
    signal,
  );
  if (!key.ok) return key;
  try {
    signal.throwIfAborted();
    const chat = liveChats(a.keyring)[0];
    if (chat === undefined) return err(inputInvalid(ENCRYPTED_CONVERSATION));
    let payload: ReturnType<typeof chat.encryptMessage>;
    try {
      payload = chat.encryptMessage({
        conversationId: sdkConversationId(target.xConversationId),
        text: a.text,
        conversationKey: key.value.conversationKey,
        conversationKeyVersion: key.value.conversationKeyVersion,
      });
    } catch (e) {
      return err(
        sdkFailure(e, "x chat: the SDK could not encrypt the reply", {
          accountId: target.accountId,
          xConversationId: target.xConversationId,
        }),
      );
    }
    return ok({
      messageId: payload.messageId,
      encodedMessageCreateEvent: payload.encodedMessageCreateEvent,
      encodedMessageEventSignature: payload.encodedMessageEventSignature,
      xdkVersion: payload.xdkVersion,
    });
  } finally {
    key.value.conversationKey.fill(0);
  }
}

async function encryptReply(
  deps: Deps,
  target: SendTarget,
  text: string,
  signal: AbortSignal,
): Promise<Result<ChatMessageBody, AppError>> {
  const keyring = await openKeyring(deps, target, signal);
  if (!keyring.ok) return keyring;
  try {
    signal.throwIfAborted();
    return await encryptWith(deps, { target, keyring: keyring.value, text }, signal);
  } finally {
    keyring.value.dispose();
  }
}

export async function deliverEncrypted(
  deps: Deps,
  target: SendTarget,
  text: string,
  signal: AbortSignal,
): Promise<Result<{ eventId: string }, AppError>> {
  const body = await encryptReply(deps, target, text, signal);
  if (!body.ok) return body;
  return withAccessToken(
    deps.db,
    deps.client,
    target.accountId,
    async (token) =>
      deliveryOutcome(
        await deps.client.sendChatMessage(token, target.xConversationId, body.value, signal),
      ),
    signal,
  );
}
