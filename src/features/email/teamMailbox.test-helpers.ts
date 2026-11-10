import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AuthUser } from "@/features/permissions/types";
import type { TestDb } from "@/test/db";

export const teamActor = (id: string, type: AuthUser["type"] = "regular"): AuthUser => ({
  id,
  type,
  isActive: true,
  groupIds: new Set(),
});

export async function seedTeamMailbox(
  db: TestDb["db"],
  memberIds: string[],
  signal: AbortSignal,
): Promise<{ accountId: string; threadId: string }> {
  signal.throwIfAborted();
  const accountId = randomUUID();
  const threadId = randomUUID();
  await db.execute(sql`INSERT INTO email_accounts (id, kind, email_address, display_name)
    VALUES (${accountId}, 'team', ${`${accountId}@example.com`}, 'Sales')`);
  signal.throwIfAborted();
  for (const id of memberIds) {
    await db.execute(sql`INSERT INTO email_account_members VALUES (${accountId}, ${id})`);
    signal.throwIfAborted();
  }
  await db.execute(sql`INSERT INTO email_threads (id, account_id, gmail_thread_id, subject, last_message_at, last_inbound_at)
    VALUES (${threadId}, ${accountId}, ${threadId}, 'Team request', now(), now())`);
  signal.throwIfAborted();
  return { accountId, threadId };
}
