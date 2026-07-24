import { sql } from "drizzle-orm";
import { wsChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { notifyEmailEvent } from "@/features/notifications/wire";
import { publishEvent } from "@/server/notify";
import type { DbOrTx } from "@/server/realtime/channelVersions";

export interface TokenRow {
  id: string;
  send_attempt_id: string;
  message_id: string | null;
  recipient: string;
  target_url: string | null;
  disabled: boolean;
}

// Load the token row plus the owner user id for the publish channel.
async function loadToken(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
): Promise<{ row: TokenRow; ownerId: string } | null> {
  const res = await db.execute(sql`
    SELECT t.id, t.send_attempt_id, t.message_id, t.recipient, t.target_url, t.disabled, a.user_id AS owner_id
    FROM email_tracking_tokens t
    JOIN email_send_attempts s ON s.id = t.send_attempt_id
    JOIN email_accounts a ON a.id = s.account_id
    WHERE t.token = ${token}
  `);
  signal.throwIfAborted();
  const row = res.rows[0] as (TokenRow & { owner_id: string }) | undefined;
  if (row === undefined) return null;
  return {
    row: {
      id: row.id,
      send_attempt_id: row.send_attempt_id,
      message_id: row.message_id,
      recipient: row.recipient,
      target_url: row.target_url,
      disabled: row.disabled,
    },
    ownerId: row.owner_id,
  };
}

// Read-only token lookup, no event write. Exported for the redirect-only click path
// (resolveClickTarget), which needs the stored target_url to send a real recipient to the real
// destination but must not pay for, or record, the full event when /t/click is over its limit.
export async function loadTokenRow(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
): Promise<TokenRow | null> {
  const loaded = await loadToken(db, token, signal);
  return loaded?.row ?? null;
}

// Write a tracking event (+ publish) unless the token is disabled or not yet backfilled
// with a message_id (the event table requires a non-null message FK). Best-effort: the
// caller serves the pixel / redirect regardless. Returns the loaded row (for target_url)
// or null when the token is unknown.
export async function recordEvent(
  db: Db,
  token: string,
  userAgent: string | null,
  kind: "open" | "click",
  signal: AbortSignal,
): Promise<TokenRow | null> {
  const loaded = await loadToken(db, token, signal);
  if (loaded === null) return null;
  const { row, ownerId } = loaded;

  // Disabled tokens record nothing; a missing message_id means the send has not
  // reconciled yet, so there is no message to anchor the event to.
  if (row.disabled || row.message_id === null) return row;
  const messageId = row.message_id;

  // Capture the inserted event id and the message's thread_id so we can fire the
  // notification OUTSIDE the transaction (best-effort; never aborts the record).
  const eventId = await db.transaction(async (tx) => {
    const ins = await tx.execute(sql`
      INSERT INTO email_tracking_events (token_id, message_id, event_type, recipient, target_url, user_agent)
      VALUES (${row.id}, ${messageId}, ${kind}, ${row.recipient}, ${row.target_url}, ${userAgent})
      RETURNING id
    `);
    await publishEvent(
      tx,
      {
        v: 1,
        channel: wsChannel.user(ownerId),
        ts: new Date().toISOString(),
        actorId: null,
        type: "email_tracking",
        data: { sendAttemptId: row.send_attempt_id, kind },
      },
      signal,
    );
    const inserted = ins.rows[0] as { id: string } | undefined;
    return inserted?.id ?? null;
  });

  // Resolve the thread_id for the notification payload. Best-effort: if the query
  // fails or the message is gone, we skip the notification and continue.
  if (eventId !== null) {
    try {
      const msgRow = (
        await db.execute(sql`SELECT thread_id FROM email_messages WHERE id = ${messageId}`)
      ).rows[0] as { thread_id: string } | undefined;
      if (msgRow !== undefined) {
        await notifyEmailEvent(db, {
          kind: kind === "open" ? "email_open" : "email_click",
          mailboxOwnerId: ownerId,
          threadId: msgRow.thread_id,
          messageId,
          eventId,
          signal,
        });
      }
    } catch (err) {
      console.warn("recordEvent: notification failed (best-effort)", { err });
    }
  }

  return row;
}
