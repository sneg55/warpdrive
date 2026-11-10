import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { mailboxAccessPredicate } from "./mailboxAccess";
import { unreadPredicate } from "./unreadPredicate";

export interface ActorMailbox {
  id: string;
  emailAddress: string;
  displayName: string;
  kind: "personal" | "team";
  status: string;
  unread: number;
}

export async function listActorMailboxes(
  db: Db,
  actorId: string,
  signal: AbortSignal,
): Promise<ActorMailbox[]> {
  signal.throwIfAborted();
  const rows =
    await db.execute(sql`SELECT a.id, a.email_address AS "emailAddress", COALESCE(a.display_name, a.email_address) AS "displayName",
    a.kind, a.status, count(t.id) FILTER (WHERE t.archived_at IS NULL AND t.trashed_at IS NULL AND (${unreadPredicate}))::int AS unread
    FROM email_accounts a LEFT JOIN email_threads t ON t.account_id=a.id
    LEFT JOIN email_thread_reads r ON a.kind='personal' AND r.thread_id=t.id AND r.user_id=${actorId}
    WHERE ${mailboxAccessPredicate(actorId)} GROUP BY a.id ORDER BY a.kind, a.display_name, a.id`);
  signal.throwIfAborted();
  return rows.rows as unknown as ActorMailbox[];
}
