import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser, VisibleRecord } from "@/features/permissions/types";
import { hydrateActor } from "@/server/hydrateActor";
import { hydrateOwner } from "./syncCursor";

export type MailboxVisibility = (record: VisibleRecord) => boolean;

export async function mailboxVisibility(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<MailboxVisibility> {
  signal.throwIfAborted();
  const account = await db.execute(
    sql`SELECT user_id, kind FROM email_accounts WHERE id=${accountId}`,
  );
  signal.throwIfAborted();
  const row = account.rows[0] as { user_id: string | null; kind: string } | undefined;
  if (row === undefined) return () => false;
  if (row.user_id !== null) {
    const owner = await hydrateOwner(db, row.user_id, signal);
    return (record) => owner.ok && canSee(owner.value, record);
  }
  const members = await db.execute(
    sql`SELECT user_id FROM email_account_members WHERE account_id=${accountId}`,
  );
  signal.throwIfAborted();
  const actors: AuthUser[] = [];
  for (const member of members.rows as { user_id: string }[]) {
    const actor = await hydrateActor(db, member.user_id, signal);
    if (actor !== null) actors.push(actor);
  }
  return (record) => actors.some((actor) => canSee(actor, record));
}
