import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { X_DM_TEXT_MAX } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { isXMember, xAccountNotFound } from "./access";
import { loadChatKeyState } from "./chatKeyState";
import { publishXConversationUpdated } from "./events";
import { deliverEncrypted } from "./sendEncrypted";
import {
  deliveryOutcome,
  ENCRYPTED_CONVERSATION,
  inputInvalid,
  type SendTarget,
} from "./sendOutcome";
import { snowflakeToDate } from "./snowflake";
import { withAccessToken } from "./tokens";
import type { XClient } from "./types";

async function loadTarget(
  db: Db,
  conversationId: string,
  signal: AbortSignal,
): Promise<SendTarget | null> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`SELECT c.account_id, a.x_user_id, c.x_conversation_id,
      c.participant_x_user_id, c.encrypted
    FROM x_conversations c JOIN x_accounts a ON a.id = c.account_id
    WHERE c.id = ${conversationId}::uuid`);
  signal.throwIfAborted();
  const row = rows.rows[0] as
    | {
        account_id: string;
        x_user_id: string;
        x_conversation_id: string;
        participant_x_user_id: string;
        encrypted: boolean;
      }
    | undefined;
  if (!row) return null;
  return {
    accountId: row.account_id,
    accountXUserId: row.x_user_id,
    xConversationId: row.x_conversation_id,
    participantXUserId: row.participant_x_user_id,
    encrypted: row.encrypted,
  };
}

async function storeOutbound(
  db: Db,
  a: { actorId: string; conversationId: string; target: SendTarget; eventId: string; text: string },
  signal: AbortSignal,
): Promise<string> {
  const sentAt = snowflakeToDate(a.eventId).toISOString();
  const id = await db.transaction(async (tx) => {
    const conn = tx as unknown as Db;
    await conn.execute(sql`INSERT INTO x_messages
      (conversation_id, x_event_id, direction, sender_x_user_id, text, has_media, sent_at, sent_by_user_id)
      VALUES (${a.conversationId}::uuid, ${a.eventId}, 'outbound', ${a.target.accountXUserId}, ${a.text},
        false, ${sentAt}::timestamptz,
        (SELECT ${a.actorId}::uuid WHERE EXISTS (SELECT 1 FROM x_account_members m
          WHERE m.account_id = ${a.target.accountId}::uuid AND m.user_id = ${a.actorId}::uuid)))
      ON CONFLICT (conversation_id, x_event_id) DO UPDATE
      SET sent_by_user_id = COALESCE(x_messages.sent_by_user_id, EXCLUDED.sent_by_user_id),
        text = CASE WHEN x_messages.text = '' AND NOT x_messages.has_media
          THEN EXCLUDED.text ELSE x_messages.text END
      WHERE x_messages.sent_by_user_id IS NULL
        OR (x_messages.text = '' AND NOT x_messages.has_media)`);
    await conn.execute(sql`UPDATE x_conversations
      SET last_message_at = GREATEST(last_message_at, ${sentAt}::timestamptz), updated_at = now()
      WHERE id = ${a.conversationId}::uuid`);
    const rows = await conn.execute(sql`SELECT id FROM x_messages
      WHERE conversation_id = ${a.conversationId}::uuid AND x_event_id = ${a.eventId}`);
    await publishXConversationUpdated(tx, a.conversationId, a.actorId, signal);
    return (rows.rows[0] as { id: string }).id;
  });
  signal.throwIfAborted();
  return id;
}

async function deliver(
  deps: { db: Db; client: XClient },
  target: SendTarget,
  text: string,
  signal: AbortSignal,
): Promise<Result<{ eventId: string }, AppError>> {
  return withAccessToken(
    deps.db,
    deps.client,
    target.accountId,
    async (token) => {
      const r = await deps.client.sendDm(
        token,
        { participantId: target.participantXUserId, text },
        signal,
      );
      return deliveryOutcome(r);
    },
    signal,
  );
}

export async function sendXReply(
  deps: { db: Db; client: XClient },
  args: { actorId: string; conversationId: string; text: string },
  signal: AbortSignal,
): Promise<Result<{ messageId: string }, AppError>> {
  const text = args.text.trim();
  if (text.length === 0 || text.length > X_DM_TEXT_MAX) return err(inputInvalid("text length"));
  const target = await loadTarget(deps.db, args.conversationId, signal);
  if (target === null) return err(xAccountNotFound());
  const member = await isXMember(
    deps.db,
    { actorId: args.actorId, accountId: target.accountId },
    signal,
  );
  if (!member) return err(xAccountNotFound());
  if (
    target.encrypted &&
    (await loadChatKeyState(deps.db, target.accountId, signal)) !== "unlocked"
  )
    return err(inputInvalid(ENCRYPTED_CONVERSATION));
  const sent = target.encrypted
    ? await deliverEncrypted(deps, target, text, signal)
    : await deliver(deps, target, text, signal);
  if (!sent.ok) return sent;
  try {
    const messageId = await storeOutbound(
      deps.db,
      { ...args, target, eventId: sent.value.eventId, text },
      signal,
    );
    return ok({ messageId });
  } catch (e) {
    if (signal.aborted || (e instanceof Error && e.name === "AbortError")) throw e;
    const error = new AppError(
      ERROR_IDS.X_SENT_NOT_RECORDED,
      "x accepted the reply but storing it failed",
      {
        conversationId: args.conversationId,
        cause: e instanceof Error ? e.message : String(e),
      },
    );
    console.error(`${error.id} x send: reply sent but not recorded`, {
      conversationId: args.conversationId,
    });
    return err(error);
  }
}
