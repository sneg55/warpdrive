import { type SQL, sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import { X_LIST_PAGE_SIZE } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { isXMember, memberOf, xAccountNotFound } from "./access";
import {
  type ConversationSqlRow,
  conversationColumns,
  isoUtc,
  toConversationRow,
  type XConversationRow,
  xUnreadPredicate,
} from "./conversationRow";
import { decodeXCursor, encodeXCursor } from "./cursor";

export type { XConversationRow } from "./conversationRow";

export type XListView = "inbox" | "archived";

export interface XAccountSummary {
  id: string;
  displayName: string;
  username: string;
  unread: number;
}

export interface XMessageRow {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  hasMedia: boolean;
  sentAt: string;
  sentByFirstName: string | null;
  unreadable: boolean;
}

export interface XConversationDetail {
  conversation: XConversationRow & { accountId: string; xUnread: boolean | null };
  messages: XMessageRow[];
}

export async function listXAccountsForActor(
  db: Db,
  actorId: string,
  signal: AbortSignal,
): Promise<XAccountSummary[]> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`SELECT a.id, a.display_name, a.username,
      count(c.id) FILTER (WHERE ${xUnreadPredicate})::int AS unread
    FROM x_accounts a
    JOIN x_account_members m ON m.account_id = a.id AND m.user_id = ${actorId}::uuid
    LEFT JOIN x_conversations c ON c.account_id = a.id AND c.archived_at IS NULL
    GROUP BY a.id ORDER BY lower(a.display_name), a.id`);
  signal.throwIfAborted();
  return (
    rows.rows as { id: string; display_name: string; username: string; unread: number }[]
  ).map((r) => ({ id: r.id, displayName: r.display_name, username: r.username, unread: r.unread }));
}

export async function listXConversations(
  db: Db,
  args: { actorId: string; accountId: string; view: XListView; cursor?: string },
  signal: AbortSignal,
): Promise<Result<{ rows: XConversationRow[]; nextCursor: string | null }, AppError>> {
  const cursor = args.cursor === undefined ? null : decodeXCursor(args.cursor);
  if (cursor !== null && !cursor.ok) return cursor;
  if (!(await isXMember(db, args, signal)))
    return err(xAccountNotFound({ accountId: args.accountId }));
  const after: SQL =
    cursor === null
      ? sql`true`
      : sql`(c.last_message_at, c.id) < (${cursor.value.at}::timestamptz, ${cursor.value.id}::uuid)`;
  const archived = args.view === "archived" ? sql`IS NOT NULL` : sql`IS NULL`;
  const rows = await db.execute(sql`SELECT ${conversationColumns}
    FROM x_conversations c JOIN x_accounts a ON a.id = c.account_id
    WHERE c.account_id = ${args.accountId}::uuid AND ${memberOf(args.actorId, sql`c.account_id`)}
      AND c.last_message_at IS NOT NULL AND c.archived_at ${archived} AND ${after}
    ORDER BY c.last_message_at DESC, c.id DESC LIMIT ${X_LIST_PAGE_SIZE + 1}`);
  signal.throwIfAborted();
  const page = rows.rows as unknown as ConversationSqlRow[];
  const more = page.length > X_LIST_PAGE_SIZE;
  const shown = page.slice(0, X_LIST_PAGE_SIZE);
  const last = shown.at(-1);
  return ok({
    rows: shown.map(toConversationRow),
    nextCursor:
      more && last !== undefined ? encodeXCursor({ at: last.sort_key, id: last.id }) : null,
  });
}

export async function getXConversation(
  db: Db,
  args: { actorId: string; conversationId: string },
  signal: AbortSignal,
): Promise<Result<XConversationDetail, AppError>> {
  signal.throwIfAborted();
  const found = await db.execute(sql`SELECT ${conversationColumns}
    FROM x_conversations c JOIN x_accounts a ON a.id = c.account_id
    WHERE c.id = ${args.conversationId}::uuid AND ${memberOf(args.actorId, sql`c.account_id`)}
      AND c.last_message_at IS NOT NULL`);
  signal.throwIfAborted();
  const row = found.rows[0] as ConversationSqlRow | undefined;
  if (row === undefined) return err(xAccountNotFound({ conversationId: args.conversationId }));
  const messages = await db.execute(sql`SELECT x.id, x.direction, x.text, x.has_media,
      ${isoUtc(sql`x.sent_at`)} AS sent_at, NULLIF(split_part(u.name, ' ', 1), '') AS first_name
    FROM x_messages x LEFT JOIN users u ON u.id = x.sent_by_user_id
    WHERE x.conversation_id = ${row.id}::uuid
    ORDER BY x.sent_at, x.id`);
  signal.throwIfAborted();
  return ok({
    conversation: { ...toConversationRow(row), accountId: row.account_id, xUnread: row.x_unread },
    messages: (
      messages.rows as {
        id: string;
        direction: "inbound" | "outbound";
        text: string;
        has_media: boolean;
        sent_at: string;
        first_name: string | null;
      }[]
    ).map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text,
      hasMedia: m.has_media,
      sentAt: m.sent_at,
      sentByFirstName: m.first_name,
      unreadable: m.text === "" && !m.has_media,
    })),
  });
}
