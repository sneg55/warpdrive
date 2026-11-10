import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { resolveLink } from "./linking";
import type { MailboxVisibility } from "./mailboxVisibility";
import type { ParsedGmailMessage } from "./mimeParse";

export async function upsertAppliedThread(
  tx: DbOrTx,
  args: { accountId: string; visible: MailboxVisibility; importedAt?: Date; signal: AbortSignal },
  parsed: ParsedGmailMessage,
): Promise<{ id: string; dealId: string | null }> {
  args.signal.throwIfAborted();
  const existing = await tx.execute(
    sql`SELECT id, deal_id FROM email_threads WHERE account_id=${args.accountId} AND gmail_thread_id=${parsed.threadId}`,
  );
  args.signal.throwIfAborted();
  const found = existing.rows[0] as { id: string; deal_id: string | null } | undefined;
  if (found !== undefined) {
    await tx.execute(
      sql`UPDATE email_threads SET last_message_at=GREATEST(last_message_at, ${parsed.sentAt}), updated_at=now() WHERE id=${found.id}`,
    );
    args.signal.throwIfAborted();
    return { id: found.id, dealId: found.deal_id };
  }
  const link = await resolveLink(
    tx,
    { visible: args.visible, participants: parsed.participants, fromEmail: parsed.fromEmail },
    args.signal,
  );
  const personId = link.kind === "linked" ? link.personId : null;
  const dealId = link.kind === "linked" ? link.dealId : null;
  const created =
    await tx.execute(sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, person_id, deal_id, last_message_at, team_read_at)
    VALUES (${parsed.threadId}, ${args.accountId}, ${parsed.subject}, ${personId}, ${dealId}, ${parsed.sentAt}, ${args.importedAt ?? null})
    ON CONFLICT (account_id, gmail_thread_id) DO UPDATE SET last_message_at=GREATEST(email_threads.last_message_at, EXCLUDED.last_message_at)
    RETURNING id, deal_id`);
  args.signal.throwIfAborted();
  const row = created.rows[0] as { id: string; deal_id: string | null } | undefined;
  if (row === undefined)
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "thread insert returned no row", {});
  return { id: row.id, dealId: row.deal_id };
}
