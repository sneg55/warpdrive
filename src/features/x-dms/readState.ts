import { type SQL, sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { memberOf, xAccountNotFound } from "./access";
import { xUnreadPredicate } from "./conversationRow";
import { publishXConversationUpdated } from "./events";

type ConversationArgs = { actorId: string; conversationId: string };

async function updateAsMember(
  db: Db,
  args: ConversationArgs,
  set: SQL,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`UPDATE x_conversations c SET ${set}, updated_at = now()
      WHERE c.id = ${args.conversationId}::uuid AND ${memberOf(args.actorId, sql`c.account_id`)}
      RETURNING c.id`);
    signal.throwIfAborted();
    if (rows.rows.length === 0) return false;
    await publishXConversationUpdated(tx, args.conversationId, args.actorId, signal);
    return true;
  });
  signal.throwIfAborted();
  return updated ? ok(undefined) : err(xAccountNotFound({ conversationId: args.conversationId }));
}

export function markXConversationRead(
  db: Db,
  args: ConversationArgs,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  return updateAsMember(
    db,
    args,
    sql`team_read_at = now(), team_read_by_user_id = ${args.actorId}::uuid`,
    signal,
  );
}

export function markXConversationUnread(
  db: Db,
  args: ConversationArgs,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  return updateAsMember(db, args, sql`team_read_at = NULL, team_read_by_user_id = NULL`, signal);
}

export function archiveXConversation(
  db: Db,
  args: ConversationArgs,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  return updateAsMember(db, args, sql`archived_at = now()`, signal);
}

export function unarchiveXConversation(
  db: Db,
  args: ConversationArgs,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  return updateAsMember(db, args, sql`archived_at = NULL`, signal);
}

export async function xUnreadCount(
  db: Db,
  args: { actorId: string; accountId?: string },
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted();
  const scope =
    args.accountId === undefined ? sql`true` : sql`c.account_id = ${args.accountId}::uuid`;
  const rows = await db.execute(sql`SELECT count(*)::int AS count FROM x_conversations c
    WHERE ${memberOf(args.actorId, sql`c.account_id`)} AND ${scope}
      AND c.archived_at IS NULL AND ${xUnreadPredicate}`);
  signal.throwIfAborted();
  return (rows.rows[0] as { count: number }).count;
}
