import { type SQL, sql } from "drizzle-orm";
import { X_SNIPPET_LENGTH } from "@/constants/xDms";
import type { TeamReplyStatus } from "@/features/email/replyStatus";
import { xReplyStatusProjection } from "./replyStatus";

export interface XConversationRow {
  id: string;
  participantUsername: string | null;
  participantName: string | null;
  participantAvatarUrl: string | null;
  encrypted: boolean;
  snippet: string | null;
  lastMessageAt: string;
  unread: boolean;
  replyStatus: TeamReplyStatus | null;
}

export interface ConversationSqlRow {
  id: string;
  account_id: string;
  participant_username: string | null;
  participant_name: string | null;
  participant_avatar_url: string | null;
  encrypted: boolean;
  x_unread: boolean;
  snippet: string | null;
  last_message_at: string;
  sort_key: string;
  unread: boolean;
  reply_status: TeamReplyStatus | null;
}

export const isoUtc = (expr: SQL): SQL =>
  sql`to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const sortKey = (expr: SQL): SQL =>
  sql`to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export const shownMessage = (alias: SQL): SQL => sql`(${alias}.text <> '' OR ${alias}.has_media)`;

export const xUnreadPredicate = sql`(c.last_inbound_at IS NOT NULL
  AND (c.team_read_at IS NULL OR c.team_read_at < c.last_inbound_at))`;

export const conversationColumns = sql`c.id, c.account_id, c.participant_username, c.participant_name,
  c.participant_avatar_url, c.encrypted, c.x_unread,
  CASE WHEN c.encrypted THEN NULL ELSE (
    SELECT left(s.text, ${X_SNIPPET_LENGTH}) FROM x_messages s
    WHERE s.conversation_id = c.id AND ${shownMessage(sql`s`)}
    ORDER BY s.sent_at DESC, s.id DESC LIMIT 1
  ) END AS snippet,
  ${isoUtc(sql`c.last_message_at`)} AS last_message_at,
  ${sortKey(sql`c.last_message_at`)} AS sort_key,
  ${xUnreadPredicate} AS unread,
  ${xReplyStatusProjection}`;

export function toConversationRow(r: ConversationSqlRow): XConversationRow {
  return {
    id: r.id,
    participantUsername: r.participant_username,
    participantName: r.participant_name,
    participantAvatarUrl: r.participant_avatar_url,
    encrypted: r.encrypted,
    snippet: r.snippet,
    lastMessageAt: r.last_message_at,
    unread: r.unread,
    replyStatus: r.reply_status,
  };
}
