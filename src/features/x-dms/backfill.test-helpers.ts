import type { ActionSignature } from "@xdevplatform/chat-xdk-server";
import { and, eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xConversations } from "@/db/schema/xDms";
import { ok } from "@/types/result";
import { FIXTURE_ME, rawEvent, signedEnvelope } from "./eventEnvelope.test-helpers";
import { type FixtureIdentity, identity } from "./keyedFixtures.test-helpers";
import { CONVERSATION } from "./syncSeed.test-helpers";
import type { XPublicKey, XRawEvent } from "./types";
import type { XFake } from "./xFake.test-helpers";

export const OTHER = "1000000000000000003";
export const LOST_CONVERSATION = `${FIXTURE_ME}-${OTHER}`;
const LOST_SDK_CONVERSATION = `${FIXTURE_ME}:${OTHER}`;
export const LOST_TEXT = "encrypted for a key the account does not hold";
const LOST_ME_KEY_VERSION = "1700000000009";
const OTHER_KEY_VERSION = "1700000000003";

export interface LostKeyConversation {
  keyEvents: string[];
  message: XRawEvent;
  otherKeys: XPublicKey[];
}

export interface KeyChangeCall {
  id: string;
  participantKeys: Array<{ userId: string; publicKeyVersion: string }>;
}

const publicKeyOf = (p: FixtureIdentity): XPublicKey => ({
  version: p.signingKeyVersion,
  identityPublicKey: p.registration.publicKey,
  signingPublicKey: p.registration.signingPublicKey,
  identityPublicKeySignature: p.registration.identityPublicKeySignature,
  juiceboxConfig: null,
});

const firstAction = (actions: ActionSignature[]): ActionSignature => {
  const [action] = actions;
  if (action === undefined)
    throw new AppError(ERROR_IDS.X_PARSE_FAILED, "the SDK returned no action signature");
  return action;
};

export async function buildLostKeyConversation(): Promise<LostKeyConversation> {
  const lostMe = await identity(FIXTURE_ME, LOST_ME_KEY_VERSION);
  const other = await identity(OTHER, OTHER_KEY_VERSION);
  const conversationId = LOST_SDK_CONVERSATION;
  const change = other.chat.prepareConversationKeyChange({
    conversationId,
    publicKeys: [lostMe, other].map((p) => ({
      userId: p.userId,
      identityPublicKey: p.registration.publicKey,
      publicKeyVersion: p.signingKeyVersion,
    })),
  });
  const sealed = other.chat.encryptMessage({
    conversationId,
    text: LOST_TEXT,
    conversationKey: change.conversationKey,
    conversationKeyVersion: change.conversationKeyVersion,
  });
  return {
    keyEvents: [
      signedEnvelope(20, OTHER, firstAction(change.actionSignatures), LOST_SDK_CONVERSATION),
    ],
    message: rawEvent(21, OTHER, sealed.eventB64),
    otherKeys: [publicKeyOf(other)],
  };
}

export function serveLostKeyConversation(fake: XFake, lost: LostKeyConversation): void {
  fake.publicKeys.set(OTHER, lost.otherKeys);
  fake.keyEvents.set(LOST_CONVERSATION, lost.keyEvents);
}

export function recordKeyChanges(fake: XFake): KeyChangeCall[] {
  const calls: KeyChangeCall[] = [];
  fake.client.addConversationKeys = (_t, id, body) => {
    const participantKeys = body.conversationParticipantKeys as KeyChangeCall["participantKeys"];
    calls.push({
      id,
      participantKeys: participantKeys
        .map((k) => ({ userId: k.userId, publicKeyVersion: k.publicKeyVersion }))
        .sort((x, y) => x.userId.localeCompare(y.userId)),
    });
    const action = firstAction(body.actionSignatures as ActionSignature[]);
    fake.keyEvents.set(id, [
      signedEnvelope(30 + calls.length, FIXTURE_ME, action, id.replace("-", ":")),
      ...(fake.keyEvents.get(id) ?? []),
    ]);
    return Promise.resolve(ok({ conversationId: id, sequenceId: String(calls.length) }));
  };
  return calls;
}

export async function setBackfilled(
  db: Db,
  accountId: string,
  version: string | null,
  id: string = CONVERSATION,
): Promise<void> {
  await db
    .update(xConversations)
    .set({ backfilledKeyVersion: version })
    .where(and(eq(xConversations.accountId, accountId), eq(xConversations.xConversationId, id)));
}
