import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";

export function mailboxAccessPredicate(actorId: string): SQL {
  return sql`(a.user_id = ${actorId} OR (a.kind = 'team' AND EXISTS (
    SELECT 1 FROM email_account_members am WHERE am.account_id = a.id AND am.user_id = ${actorId}
  )))`;
}

export function mailboxScopePredicate(actorId: string, mailbox?: string): SQL {
  return mailbox === undefined
    ? sql`a.user_id = ${actorId}`
    : sql`(a.id = ${mailbox} AND a.kind = 'team' AND ${mailboxAccessPredicate(actorId)})`;
}

export async function canUseMailbox(
  db: Db,
  accountId: string,
  actorId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  const rows = await db.execute(
    sql`SELECT 1 FROM email_accounts a WHERE a.id=${accountId} AND ${mailboxAccessPredicate(actorId)}`,
  );
  signal.throwIfAborted();
  return rows.rows.length > 0;
}
