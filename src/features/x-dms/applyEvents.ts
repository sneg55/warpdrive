import { type Column, eq, sql } from "drizzle-orm";
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
}

type MessageInsert = typeof xMessages.$inferInsert;
type Direction = MessageInsert["direction"];

const newestOf = (events: XRawEvent[]): XRawEvent | undefined =>
  events.reduce<XRawEvent | undefined>(
    (best, e) => (best === undefined || BigInt(e.id) > BigInt(best.id) ? e : best),
    undefined,
  );

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
    const inserted =
      rows.length === 0
        ? []
        : await tx
            .insert(xMessages)
            .values(rows)
            .onConflictDoNothing({ target: [xMessages.conversationId, xMessages.xEventId] })
            .returning({ direction: xMessages.direction });
    const inbound = rows.filter((r) => r.direction === "inbound");
    const newInbound = inserted.some((r) => r.direction === "inbound");
    const trusted = newestOf(
      a.events.filter((e) => e.senderId !== a.accountXUserId && e.isTrusted !== null),
    );
    await tx
      .update(xConversations)
      .set({
        newestEventId: a.changed.newestEventId,
        xUnread: a.changed.conversation.unread,
        lastMessageAt: greatest(xConversations.lastMessageAt, maxDate(rows.map((r) => r.sentAt))),
        lastInboundAt: greatest(
          xConversations.lastInboundAt,
          maxDate(inbound.map((r) => r.sentAt)),
        ),
        ...(a.parsed.needsKeys ? { encrypted: true } : {}),
        ...(trusted === undefined ? {} : { isTrusted: trusted.isTrusted }),
        ...(newInbound && !(a.firstRun && a.changed.isNew)
          ? { archivedAt: null, teamReadAt: null, teamReadByUserId: null }
          : {}),
        ...profile(a),
        updatedAt: a.now,
      })
      .where(eq(xConversations.id, conversation.id));
    if (inserted.length > 0) await publishXConversationUpdated(tx, conversation.id, null, signal);
    return ok({ messages: inserted.length, conversationId: conversation.id });
  });
  signal.throwIfAborted();
  return result;
}
