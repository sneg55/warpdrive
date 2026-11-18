import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

export async function softDisconnectMailbox(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db.execute(sql`
    UPDATE email_accounts
    SET status='disconnected', refresh_token_enc=NULL, provider_credentials_enc=NULL, last_error_id=NULL, updated_at=now()
    WHERE id=${accountId}
  `);
}
