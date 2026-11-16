import { createChat, type PreparedConversationChange } from "@xdevplatform/chat-xdk-server";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  FIXTURE_CONVERSATION,
  FIXTURE_ME,
  FIXTURE_THEM,
  rawEvent,
  signedEnvelope,
} from "./eventEnvelope.test-helpers";
import {
  type AccountChatKeys,
  type ChatKeyring,
  createChatKeyring,
  toSigningKeys,
} from "./keyedParser";
import type { XPublicKey, XRawEvent, XSigningKey } from "./types";

export const FIXTURE_ROTATED_TEXT = "sent after a key rotation";
const ME_ROTATED_KEY_VERSION = "1700000000002";

export type FixtureIdentity = Awaited<ReturnType<typeof identity>>;

export interface KeyedFixtures {
  meKeys(): AccountChatKeys;
  rotatedKeys(): AccountChatKeys;
  keyEvents: string[];
  rotatedKeyEvents: string[];
  publicKeys: { me: XPublicKey[]; them: XPublicKey[] };
  conversationKeyVersion: string;
  rotatedConversationKeyVersion: string;
  rotatedMessage: XRawEvent;
}

export async function identity(userId: string, signingKeyVersion: string) {
  const chat = await createChat();
  const registration = chat.generateKeypairs().publicKey;
  chat.setIdentity({ userId, signingKeyVersion });
  return { chat, registration, userId, signingKeyVersion };
}

export function keyChangeFor(by: FixtureIdentity, members: FixtureIdentity[]) {
  return by.chat.prepareConversationKeyChange({
    conversationId: FIXTURE_CONVERSATION,
    publicKeys: members.map((p) => ({
      userId: p.userId,
      identityPublicKey: p.registration.publicKey,
      publicKeyVersion: p.signingKeyVersion,
    })),
  });
}

function publicKey(p: FixtureIdentity): XPublicKey {
  return {
    version: p.signingKeyVersion,
    identityPublicKey: p.registration.publicKey,
    signingPublicKey: p.registration.signingPublicKey,
    identityPublicKeySignature: p.registration.identityPublicKeySignature,
    juiceboxConfig: null,
  };
}

const blobOf = (p: FixtureIdentity) => ({
  keyVersion: p.signingKeyVersion,
  blob: p.chat.exportKeys(),
});

export async function buildKeyedFixtures(a: {
  me: FixtureIdentity;
  them: FixtureIdentity;
  change: PreparedConversationChange;
  keyChangeEvent: string;
}): Promise<KeyedFixtures> {
  const rotated = await identity(FIXTURE_ME, ME_ROTATED_KEY_VERSION);
  const rotatedChange = keyChangeFor(rotated, [rotated, a.them]);
  const rotatedKeyEvent = signedEnvelope(
    8,
    FIXTURE_ME,
    rotatedChange.actionSignatures[0] ?? missing(),
  );
  const rotatedMessage = rawEvent(
    9,
    FIXTURE_ME,
    rotated.chat.encryptMessage({
      conversationId: FIXTURE_CONVERSATION,
      text: FIXTURE_ROTATED_TEXT,
      conversationKey: rotatedChange.conversationKey,
      conversationKeyVersion: rotatedChange.conversationKeyVersion,
    }).eventB64,
  );
  return {
    meKeys: () => ({ xUserId: FIXTURE_ME, keys: [blobOf(a.me)] }),
    rotatedKeys: () => ({ xUserId: FIXTURE_ME, keys: [blobOf(rotated), blobOf(a.me)] }),
    keyEvents: [a.keyChangeEvent],
    rotatedKeyEvents: [rotatedKeyEvent, a.keyChangeEvent],
    publicKeys: { me: [publicKey(a.me), publicKey(rotated)], them: [publicKey(a.them)] },
    conversationKeyVersion: a.change.conversationKeyVersion,
    rotatedConversationKeyVersion: rotatedChange.conversationKeyVersion,
    rotatedMessage,
  };
}

export function fixtureSigningKeys(k: KeyedFixtures): XSigningKey[] {
  return [
    ...toSigningKeys(FIXTURE_ME, k.publicKeys.me),
    ...toSigningKeys(FIXTURE_THEM, k.publicKeys.them),
  ];
}

export async function openKeyring(
  open: ChatKeyring[],
  keys: AccountChatKeys,
): Promise<ChatKeyring> {
  const r = await createChatKeyring(keys);
  if (!r.ok) throw r.error;
  open.push(r.value);
  return r.value;
}

function missing(): never {
  throw new AppError(ERROR_IDS.X_PARSE_FAILED, "the SDK did not return the expected fixture part");
}
