import type { PreparedConversationChange } from "@xdevplatform/chat-xdk-server";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { accountKeyUnsigned, NUMERIC_VERSION, newestKeyUnsigned } from "./chatKeys";
import {
  type ChatKeyring,
  liveChats,
  newestUsableConversationKey,
  sdkFailure,
  toSigningKeys,
} from "./keyedParser";
import { withAccessToken } from "./tokens";
import type { XClient, XSigningKey } from "./types";

import { sdkConversationId } from "./xParse";

export interface OwnedPublicKey {
  userId: string;
  publicKeyVersion: string;
  identityPublicKey: string;
}

export interface ConversationKeyRequest {
  accountId: string;
  accountXUserId: string;
  xConversationId: string;
  participantXUserId: string;
  keyring: ChatKeyring;
  keyEvents: string[];
  pageEvents: string[];
}

export interface ConversationKey {
  conversationKey: Uint8Array;
  conversationKeyVersion: string;
  created: boolean;
}

type Deps = { db: Db; client: XClient };

const newestOf = (keys: OwnedPublicKey[]): OwnedPublicKey | undefined =>
  keys
    .filter((k) => NUMERIC_VERSION.test(k.publicKeyVersion))
    .reduce<OwnedPublicKey | undefined>(
      (best, k) =>
        best === undefined || BigInt(k.publicKeyVersion) > BigInt(best.publicKeyVersion) ? k : best,
      undefined,
    );

const idsOf = (a: ConversationKeyRequest) => ({
  accountId: a.accountId,
  xConversationId: a.xConversationId,
});

const keysMissing = (accountId: string, side: "account" | "participant") =>
  new AppError(ERROR_IDS.X_PUBLIC_KEYS_MISSING, "x chat: public keys are not available", {
    accountId,
    side,
  });

async function createKey(
  deps: Deps,
  a: ConversationKeyRequest,
  sides: { account: OwnedPublicKey[]; participant: OwnedPublicKey[] },
  signal: AbortSignal,
): Promise<Result<ConversationKey, AppError>> {
  const newest = newestOf(sides.account);
  const chat = liveChats(a.keyring)[0];
  if (newest === undefined || chat?.matchesRegisteredKey(newest.identityPublicKey) !== true)
    return err(
      new AppError(ERROR_IDS.X_CHAT_KEYS_STALE, "x chat: newest public key is not held", {
        accountId: a.accountId,
      }),
    );
  let change: PreparedConversationChange;
  try {
    change = chat.prepareConversationKeyChange({
      conversationId: sdkConversationId(a.xConversationId),
      publicKeys: [newest, ...sides.participant].map((k) => ({
        userId: k.userId,
        identityPublicKey: k.identityPublicKey,
        publicKeyVersion: k.publicKeyVersion,
      })),
    });
  } catch (e) {
    return err(sdkFailure(e, "x chat: the SDK could not prepare a key change", idsOf(a)));
  }
  let handedOver = false;
  try {
    const posted = await postKeyChange(deps, a, change, signal);
    if (!posted.ok) return posted;
    signal.throwIfAborted();
    handedOver = true;
    return ok({
      conversationKey: change.conversationKey,
      conversationKeyVersion: change.conversationKeyVersion,
      created: true,
    });
  } finally {
    if (!handedOver) change.conversationKey.fill(0);
  }
}

function postKeyChange(
  deps: Deps,
  a: ConversationKeyRequest,
  change: PreparedConversationChange,
  signal: AbortSignal,
) {
  return withAccessToken(
    deps.db,
    deps.client,
    a.accountId,
    (token) =>
      deps.client.addConversationKeys(
        token,
        a.xConversationId,
        {
          conversationKeyVersion: change.conversationKeyVersion,
          conversationParticipantKeys: change.conversationParticipantKeys,
          actionSignatures: change.actionSignatures,
        },
        signal,
      ),
    signal,
  );
}

export async function ensureConversationKeyWith(
  deps: Deps,
  a: ConversationKeyRequest & { signingKeys: XSigningKey[]; publicKeys: OwnedPublicKey[] },
  signal: AbortSignal,
): Promise<Result<ConversationKey, AppError>> {
  const account = a.publicKeys.filter((k) => k.userId === a.accountXUserId);
  const participant = a.publicKeys.filter((k) => k.userId === a.participantXUserId);
  if (account.length === 0) return err(keysMissing(a.accountId, "account"));
  if (participant.length === 0) return err(keysMissing(a.accountId, "participant"));
  const usable = newestUsableConversationKey(
    a.keyring,
    [...a.keyEvents, ...a.pageEvents],
    a.signingKeys,
  );
  if (!usable.ok)
    return err(
      new AppError(usable.error.id, usable.error.message, {
        ...usable.error.context,
        ...idsOf(a),
      }),
    );
  if (signal.aborted) usable.value?.conversationKey.fill(0);
  signal.throwIfAborted();
  if (usable.value !== null) return ok({ ...usable.value, created: false });
  return createKey(deps, a, { account, participant }, signal);
}

export async function ensureConversationKey(
  deps: Deps,
  a: ConversationKeyRequest,
  signal: AbortSignal,
): Promise<Result<ConversationKey, AppError>> {
  const signingKeys: XSigningKey[] = [];
  const publicKeys: OwnedPublicKey[] = [];
  for (const userId of [a.accountXUserId, a.participantXUserId]) {
    const keys = await withAccessToken(
      deps.db,
      deps.client,
      a.accountId,
      (token) => deps.client.getPublicKeys(token, userId, signal),
      signal,
    );
    signal.throwIfAborted();
    if (!keys.ok) return keys;
    if (userId === a.accountXUserId && newestKeyUnsigned(keys.value))
      return err(accountKeyUnsigned(a.accountId));
    signingKeys.push(...toSigningKeys(userId, keys.value));
    publicKeys.push(
      ...keys.value.map((k) => ({
        userId,
        publicKeyVersion: k.version,
        identityPublicKey: k.identityPublicKey,
      })),
    );
  }
  return ensureConversationKeyWith(deps, { ...a, signingKeys, publicKeys }, signal);
}
