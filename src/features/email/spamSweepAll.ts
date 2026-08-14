import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import { sweepSpam } from "./spamSweep";

export interface SweepDeps {
  resolveClient: (accountId: string, signal: AbortSignal) => Promise<Result<GmailClient, AppError>>;
}

export interface MailboxSweepResult {
  email: string;
  ok: boolean;
  // Conversations hidden by this sweep (0 when the mailbox failed).
  hidden: number;
  errorId: string | null;
}

// Run the spam sweep across every connected mailbox. One mailbox's failure (revoked token, Gmail
// outage) is recorded and the run continues: this is an operator repair over independent accounts,
// so aborting the batch on the first bad one would leave the rest unrepaired for no reason.
export async function sweepAllMailboxes(
  db: Db,
  deps: SweepDeps,
  signal: AbortSignal,
): Promise<MailboxSweepResult[]> {
  signal.throwIfAborted();
  const accounts = (
    await db.execute(
      sql`SELECT id, email_address FROM email_accounts
          WHERE status <> 'disconnected' ORDER BY email_address`,
    )
  ).rows as { id: string; email_address: string }[];
  signal.throwIfAborted();

  const results: MailboxSweepResult[] = [];
  for (const account of accounts) {
    const email = account.email_address;
    const client = await deps.resolveClient(account.id, signal);
    signal.throwIfAborted();
    if (!client.ok) {
      results.push({ email, ok: false, hidden: 0, errorId: client.error.id });
      continue;
    }
    const swept = await sweepSpam(db, {
      accountId: account.id,
      gmail: client.value,
      signal,
    });
    results.push(
      swept.ok
        ? { email, ok: true, hidden: swept.value.hidden, errorId: null }
        : { email, ok: false, hidden: 0, errorId: swept.error.id },
    );
  }
  return results;
}
