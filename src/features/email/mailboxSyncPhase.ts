import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { mailboxScopePredicate } from "./mailboxAccess";

export const MAILBOX_SYNC_PHASES = ["syncing", "failed", "awaitingMail", "ready"] as const;
export type MailboxSyncPhase = (typeof MAILBOX_SYNC_PHASES)[number];

interface SyncPhaseRow {
  synced: boolean;
  last_error_id: string | null;
  backfill_days: number | null;
  backfill_status: string | null;
  has_threads: boolean;
}

function historyImportRunning(row: SyncPhaseRow): boolean {
  return (
    row.backfill_days !== null &&
    (row.backfill_status === null || row.backfill_status === "running")
  );
}

function phaseOf(row: SyncPhaseRow | undefined): MailboxSyncPhase {
  if (row === undefined) return "ready";
  if (!row.synced) return row.last_error_id === null ? "syncing" : "failed";
  if (historyImportRunning(row)) return "syncing";
  return row.has_threads ? "ready" : "awaitingMail";
}

export async function readMailboxSyncPhase(
  db: Db,
  args: { actorId: string; mailbox?: string },
  signal: AbortSignal,
): Promise<MailboxSyncPhase> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`
    SELECT a.last_sync_at IS NOT NULL AS synced, a.last_error_id, a.backfill_days, a.backfill_status,
      EXISTS (SELECT 1 FROM email_threads t WHERE t.account_id = a.id) AS has_threads
    FROM email_accounts a
    WHERE ${mailboxScopePredicate(args.actorId, args.mailbox)} AND a.status = 'connected'
    LIMIT 1
  `);
  signal.throwIfAborted();
  return phaseOf(rows.rows[0] as SyncPhaseRow | undefined);
}
