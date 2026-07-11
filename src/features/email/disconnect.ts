import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

// User-initiated soft disconnect of the actor's mailbox (Settings > Email sync). Mirrors the
// revocation path in tokens.ts (status -> disconnected, refresh_token_enc -> NULL) but, unlike
// a revocation, a deliberate disconnect is clean, so it clears last_error_id rather than
// recording one. NEVER hard-deletes the row: email_threads / email_messages /
// email_send_attempts FK to email_accounts, so a delete would orphan or cascade real mail
// history. Retaining the row also lets a later reconnect (exchangeAndBind ON CONFLICT
// (user_id)) reactivate the SAME row instead of duplicating it. Never reads or logs tokens.
export async function softDisconnectMailbox(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db.execute(sql`
    UPDATE email_accounts
    SET status='disconnected', refresh_token_enc=NULL, last_error_id=NULL, updated_at=now()
    WHERE id=${accountId}
  `);
}
