import {
  ChatXdkError,
  createChat,
  type Event,
  type ServerChat,
} from "@xdevplatform/chat-xdk-server";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import type { XPublicKey, XSigningKey } from "./types";

export interface AccountChatKeys {
  xUserId: string;
  keys: { keyVersion: string; blob: Uint8Array }[];
}

export interface ChatKeyring {
  readonly chats: readonly ServerChat[];
  readonly disposed: boolean;
  dispose(): void;
}

export type DecodeOutcome = { event: Event } | { error: string };

const NOT_RETURNED = "the SDK returned no event and no error for this position";

export function sdkFailure(
  cause: unknown,
  message: string,
  ids: Record<string, string> = {},
): AppError {
  if (!(cause instanceof ChatXdkError)) throw cause;
  return new AppError(ERROR_IDS.X_CHAT_SDK_FAILED, message, { ...ids, kind: cause.kind });
}

export function toSigningKeys(userId: string, keys: XPublicKey[]): XSigningKey[] {
  return keys.flatMap((k) =>
    k.identityPublicKeySignature === null
      ? []
      : [
          {
            userId,
            publicKeyVersion: k.version,
            publicKey: k.signingPublicKey,
            identityPublicKey: k.identityPublicKey,
            identityPublicKeySignature: k.identityPublicKeySignature,
          },
        ],
  );
}

function importInto(chat: ServerChat, xUserId: string, keyVersion: string, blob: Uint8Array) {
  chat.importKeys({ keys: blob, signingKeyVersion: keyVersion });
  chat.setIdentity({ userId: xUserId, signingKeyVersion: keyVersion });
  chat.setRejectUnverified(false);
}

export async function createChatKeyring(
  keys: AccountChatKeys,
): Promise<Result<ChatKeyring, AppError>> {
  const chats: ServerChat[] = [];
  let disposed = false;
  const dispose = () => {
    disposed = true;
    for (const c of chats.splice(0)) c.free();
  };
  try {
    for (const k of keys.keys) {
      const chat = await createChat();
      chats.push(chat);
      try {
        importInto(chat, keys.xUserId, k.keyVersion, k.blob);
      } catch {
        dispose();
        return err(
          new AppError(ERROR_IDS.X_CHAT_KEYS_STALE, "a stored x chat key did not import", {
            keyVersion: k.keyVersion,
          }),
        );
      }
    }
  } catch (e) {
    dispose();
    return err(sdkFailure(e, "x chat: the SDK could not create a chat"));
  }
  return ok({
    chats,
    get disposed() {
      return disposed;
    },
    dispose,
  });
}

export function liveChats(keyring: ChatKeyring): readonly ServerChat[] {
  if (keyring.disposed) {
    throw new AppError(ERROR_IDS.X_KEYRING_DISPOSED, "x chat keyring used after dispose");
  }
  return keyring.chats;
}

export function decodeWith(
  chat: ServerChat,
  keyEvents: string[],
  encoded: string[],
  signingKeys: XSigningKey[],
): DecodeOutcome[] {
  let result: ReturnType<ServerChat["decryptEvents"]>;
  try {
    result = chat.decryptEvents({ events: [...keyEvents, ...encoded], signingKeys });
  } catch (e) {
    const failure = sdkFailure(e, "x chat: the SDK could not decrypt events");
    return encoded.map(() => ({ error: `${failure.id} ${String(failure.context?.kind)}` }));
  }
  const outcomes: DecodeOutcome[] = [];
  let next = 0;
  for (let i = 0; i < keyEvents.length + encoded.length; i++) {
    const error = result.errors[String(i)];
    const decoded = error === undefined ? result.events[next++] : undefined;
    if (i < keyEvents.length) continue;
    if (error !== undefined) outcomes.push({ error });
    else outcomes.push(decoded === undefined ? { error: NOT_RETURNED } : { event: decoded.event });
  }
  return outcomes;
}

function isNewer(version: string, than: string): boolean {
  return version.length === than.length ? version > than : version.length > than.length;
}

export type UsableConversationKey = { conversationKey: Uint8Array; conversationKeyVersion: string };

export function newestUsableConversationKey(
  keyring: ChatKeyring,
  events: string[],
  signingKeys: XSigningKey[],
): Result<UsableConversationKey | null, AppError> {
  let best: UsableConversationKey | null = null;
  let failure: AppError | null = null;
  for (const chat of liveChats(keyring)) {
    let found: ReturnType<ServerChat["decryptEvents"]>["conversationKeys"];
    try {
      found = chat.decryptEvents({ events, signingKeys }).conversationKeys;
    } catch (e) {
      failure = sdkFailure(e, "x chat: the SDK could not read key changes");
      continue;
    }
    const { keys, latestVersion } = found;
    const key = latestVersion === null ? undefined : keys[latestVersion];
    if (latestVersion === null || key === undefined) continue;
    if (best === null || isNewer(latestVersion, best.conversationKeyVersion)) {
      best = { conversationKey: key, conversationKeyVersion: latestVersion };
    }
  }
  if (best === null && failure !== null) return err(failure);
  return ok(best);
}
