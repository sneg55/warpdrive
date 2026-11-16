import { and, type Column, eq, inArray, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccounts, xConversations, xMessages } from "@/db/schema/xDms";
import { err, ok, type Result } from "@/types/result";
import type { ParsedChatEvents } from "./eventParser";
import { publishXConversationUpdated } from "./events";
import type { ChangedConversation } from "./fetchChanges";
import type { XRawEvent } from "./types";

export interface ConversationApply {
  accountId: string;
  accountXUserId: string;
  changed: ChangedConversation;
  events: XRawEvent[];
  parsed: ParsedChatEvents;
  firstRun: boolean;
  now: Date;
  backfill?: boolean;
  resetBackfill?: boolean;
}

type MessageInsert = typeof xMessages.$inferInsert;
type Direction = MessageInsert["direction"];

const newestOf = (events: XRawEvent[]): XRawEvent | undefined =>
  events.reduce<XRawEvent | undefined>(
    (best, e) => (best === undefined || BigInt(e.id) > BigInt(best.id) ? e : best),
    undefined,
  );

const sentAt = (r: MessageInsert): Date => r.sentAt;

const maxDate = (dates: Date[]): Date | null =>
  dates.length === 0 ? null : new Date(Math.max(...dates.map((d) => d.getTime())));

function messageRows(a: ConversationApply, conversationId: string): MessageInsert[] {
  const direction = (senderId: string): Direction =>
    senderId === a.accountXUserId ? "outbound" : "inbound";
  const rows: MessageInsert[] = a.parsed.messages.map((m) => ({
    conversationId,
    xEventId: m.eventId,
    direction: direction(m.senderId),
    senderXUserId: m.senderId,
    text: m.text,
    hasMedia: m.hasMedia,
    sentAt: m.sentAt,
  }));
  const undecoded = new Set([...a.parsed.needsKeyEventIds, ...a.parsed.failedEventIds]);
  for (const e of a.events.filter((raw) => undecoded.has(raw.id)))
    rows.push({
      conversationId,
      xEventId: e.id,
      direction: direction(e.senderId),
      senderXUserId: e.senderId,
      text: "",
      hasMedia: false,
      sentAt: e.createdAt,
    });
  return rows;
}

function profile(a: ConversationApply) {
  const p = a.changed.participant;
  if (p === null) return {};
  return {
    participantUsername: p.username,
    participantName: p.name,
    participantAvatarUrl: p.profileImageUrl,
  };
}

const greatest = (column: Column, value: Date | null) =>
  value === null ? undefined : sql`GREATEST(${column}, ${value.toISOString()}::timestamptz)`;

const isPlaceholder = and(eq(xMessages.text, ""), eq(xMessages.hasMedia, false));

const newestRowAt = (conversationId: string, inboundOnly: boolean) =>
  sql`(SELECT max(${xMessages.sentAt}) FROM ${xMessages} WHERE ${and(
    eq(xMessages.conversationId, conversationId),
    inboundOnly ? eq(xMessages.direction, "inbound") : undefined,
  )})`;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function upsertMessages(tx: Tx, rows: MessageInsert[]) {
  if (rows.length === 0) return Promise.resolve([]);
  return tx
    .insert(xMessages)
    .values(rows)
    .onConflictDoUpdate({
      target: [xMessages.conversationId, xMessages.xEventId],
      set: { text: sql`excluded.text`, hasMedia: sql`excluded.has_media` },
      setWhere: and(isPlaceholder, sql`(excluded.text <> '' OR excluded.has_media)`),
    })
    .returning({ direction: xMessages.direction, created: sql<boolean>`(xmax = 0)` });
}

async function deletePlaceholders(tx: Tx, conversationId: string, eventIds: string[]) {
  if (eventIds.length === 0) return 0;
  const deleted = await tx
    .delete(xMessages)
    .where(
      and(
        eq(xMessages.conversationId, conversationId),
        inArray(xMessages.xEventId, eventIds),
        isPlaceholder,
      ),
    )
    .returning({ id: xMessages.id });
  return deleted.length;
}

export async function applyConversation(
  db: Db,
  a: ConversationApply,
  signal: AbortSignal,
): Promise<Result<{ messages: number; conversationId: string }, AppError>> {
  const result = await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: xAccounts.id })
      .from(xAccounts)
      .where(eq(xAccounts.id, a.accountId))
      .for("key share");
    if (account === undefined)
      return err(
        new AppError(ERROR_IDS.X_ACCOUNT_NOT_FOUND, "X account not found", {
          accountId: a.accountId,
        }),
      );
    const [conversation] = await tx
      .insert(xConversations)
      .values({
        accountId: a.accountId,
        xConversationId: a.changed.conversation.id,
        participantXUserId: a.changed.participantId,
        teamReadAt: a.firstRun ? a.now : null,
        ...profile(a),
      })
      .onConflictDoUpdate({
        target: [xConversations.accountId, xConversations.xConversationId],
        set: { updatedAt: a.now },
      })
      .returning({ id: xConversations.id });
    if (conversation === undefined)
      throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "x conversation upsert returned no row");
    const rows = messageRows(a, conversation.id);
    const written = await upsertMessages(tx, rows);
    const inserted = written.filter((r) => r.created);
    const deleted = await deletePlaceholders(tx, conversation.id, a.parsed.nonMessageEventIds);
    const inbound = rows.filter((r) => r.direction === "inbound");
    const newInbound = inserted.some((r) => r.direction === "inbound");
    const trusted = newestOf(
      a.events.filter((e) => e.senderId !== a.accountXUserId && e.isTrusted !== null),
    );
    const backfill = a.backfill === true;
    await tx
      .update(xConversations)
      .set({
        ...(backfill
          ? {}
          : { newestEventId: a.changed.newestEventId, xUnread: a.changed.conversation.unread }),
        ...(deleted > 0
          ? {
              lastMessageAt: newestRowAt(conversation.id, false),
              lastInboundAt: newestRowAt(conversation.id, true),
            }
          : {
              lastMessageAt: greatest(xConversations.lastMessageAt, maxDate(rows.map(sentAt))),
              lastInboundAt: greatest(xConversations.lastInboundAt, maxDate(inbound.map(sentAt))),
            }),
        ...(a.parsed.encrypted ? { encrypted: true } : {}),
        ...(trusted === undefined ? {} : { isTrusted: trusted.isTrusted }),
        ...(!backfill && newInbound && !(a.firstRun && a.changed.isNew)
          ? { archivedAt: null, teamReadAt: null, teamReadByUserId: null }
          : {}),
        ...(a.resetBackfill === true ? { backfilledKeyVersion: null } : {}),
        ...profile(a),
        updatedAt: a.now,
      })
      .where(eq(xConversations.id, conversation.id));
    if (written.length > 0 || deleted > 0)
      await publishXConversationUpdated(tx, conversation.id, null, signal);
    return ok({ messages: inserted.length, conversationId: conversation.id });
  });
  signal.throwIfAborted();
  return result;
}
