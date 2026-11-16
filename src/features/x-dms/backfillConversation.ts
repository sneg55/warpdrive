import { and, eq, isNull } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import { xConversations } from "@/db/schema/xDms";
import { ok, type Result } from "@/types/result";
import { applyConversation } from "./applyEvents";
import { type ParticipantKeyCache, participantKeys } from "./backfillSupport";
import { ensureConversationKeyWith } from "./conversationKeys";
import { parseChatEvents } from "./eventParser";
import { type ChangedConversation, type FetchContext, fetchNewEvents } from "./fetchChanges";
import type { ChatKeyring } from "./keyedParser";
import { toSigningKeys } from "./keyedParser";
import type { SyncDeps } from "./sync";
import type { RunKeys } from "./syncKeys";
import type { XRawEvent } from "./types";

export type PendingConversation = typeof xConversations.$inferSelect;

export interface BackfillRun {
  deps: SyncDeps;
  ctx: FetchContext;
  keys: RunKeys;
  participants: ParticipantKeyCache;
  keyring: ChatKeyring;
  heldVersion: string;
  windowFloorMs: number;
}

export interface BackfillOutcome {
  done: boolean;
  created: boolean;
}

const changedFrom = (row: PendingConversation): ChangedConversation => ({
  conversation: {
    id: row.xConversationId,
    type: "direct",
    participantIds: [row.participantXUserId],
    unread: row.xUnread,
    newestEventId: row.newestEventId,
  },
  newestEventId: row.newestEventId ?? "0",
  participantId: row.participantXUserId,
  participant: null,
  storedNewestEventId: row.newestEventId,
  storedEncrypted: row.encrypted,
  isNew: false,
});

const atOrBefore =
  (cursor: string | null) =>
  (e: XRawEvent): boolean =>
    cursor === null || BigInt(e.id) <= BigInt(cursor);

export function markDone(run: BackfillRun, row: PendingConversation) {
  const sameCursor =
    row.newestEventId === null
      ? isNull(xConversations.newestEventId)
      : eq(xConversations.newestEventId, row.newestEventId);
  return run.deps.db
    .update(xConversations)
    .set({ backfilledKeyVersion: run.heldVersion })
    .where(and(eq(xConversations.id, row.id), sameCursor))
    .returning({ id: xConversations.id });
}

export async function backfillConversation(
  run: BackfillRun,
  row: PendingConversation,
): Promise<Result<BackfillOutcome, AppError>> {
  const { deps, ctx } = run;
  const participant = await participantKeys(
    deps,
    run.participants,
    { accountId: ctx.accountId, userId: row.participantXUserId },
    ctx.signal,
  );
  if (!participant.ok) return participant;
  const fetched = await fetchNewEvents(ctx, {
    conversationId: row.xConversationId,
    storedNewestEventId: null,
    floorMs: run.windowFloorMs,
  });
  if (!fetched.ok) return fetched;
  const kept = atOrBefore(row.newestEventId);
  const events = fetched.value.events.filter(kept);
  const { keyEvents } = fetched.value;
  const contextEvents = [
    ...fetched.value.events.filter((e) => !kept(e)).map((e) => e.encodedEvent),
    ...fetched.value.contextEvents,
  ];
  const signingKeys = [
    ...run.keys.accountSigningKeys,
    ...toSigningKeys(row.participantXUserId, participant.value),
  ];
  const parsed = await parseChatEvents(events, {
    keyring: run.keyring,
    keyEvents,
    contextEvents,
    signingKeys,
  });
  ctx.signal.throwIfAborted();
  const applied = await applyConversation(
    deps.db,
    {
      accountId: ctx.accountId,
      accountXUserId: ctx.accountXUserId,
      changed: changedFrom(row),
      events,
      parsed,
      firstRun: false,
      now: new Date(deps.nowMs()),
      backfill: true,
    },
    ctx.signal,
  );
  if (!applied.ok) return applied;
  const key = await ensureConversationKeyWith(
    { db: deps.db, client: deps.client },
    {
      accountId: ctx.accountId,
      accountXUserId: ctx.accountXUserId,
      xConversationId: row.xConversationId,
      participantXUserId: row.participantXUserId,
      keyring: run.keyring,
      keyEvents,
      pageEvents: [...events.map((e) => e.encodedEvent), ...contextEvents],
      signingKeys,
      publicKeys: [
        ...run.keys.accountSigningKeys,
        ...participant.value.map((k) => ({
          userId: row.participantXUserId,
          publicKeyVersion: k.version,
          identityPublicKey: k.identityPublicKey,
        })),
      ],
    },
    ctx.signal,
  );
  if (!key.ok) return key;
  key.value.conversationKey.fill(0);
  const marked = await markDone(run, row);
  ctx.signal.throwIfAborted();
  return ok({ done: marked.length > 0, created: key.value.created });
}
