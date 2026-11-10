import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { assertTeamMailboxAdmin } from "./teamMailboxConnect";

export async function updateTeamMailbox(
  db: Db,
  args: {
    actorId: string;
    accountId: string;
    displayName: string;
    overdueAfterHours: number;
  },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const rows =
    await db.execute(sql`UPDATE email_accounts SET display_name=${args.displayName}, overdue_after_hours=${args.overdueAfterHours}, updated_at=now()
    WHERE id=${args.accountId} AND kind='team' RETURNING id`);
  signal.throwIfAborted();
  return rows.rows.length > 0
    ? ok(undefined)
    : err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "team mailbox not found", {}));
}

export interface TeamMailboxSettings {
  id: string;
  email_address: string;
  display_name: string;
  status: string;
  overdue_after_hours: number;
  backfill_status: string | null;
  backfill_error_id: string | null;
  backfill_days: number;
  member_ids: string[];
}

export async function listTeamMailboxSettings(
  db: Db,
  actorId: string,
  signal: AbortSignal,
): Promise<Result<TeamMailboxSettings[], AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, actorId, signal);
  if (!allowed.ok) return allowed;
  const rows =
    await db.execute(sql`SELECT a.id, a.email_address, COALESCE(a.display_name, a.email_address) AS display_name,
    a.status, a.overdue_after_hours, a.backfill_status, a.backfill_error_id, a.backfill_days,
    ARRAY(SELECT am.user_id FROM email_account_members am WHERE am.account_id=a.id) AS member_ids
    FROM email_accounts a WHERE a.kind='team' ORDER BY a.display_name, a.id`);
  signal.throwIfAborted();
  return ok(rows.rows as unknown as TeamMailboxSettings[]);
}

export async function assertMailboxManager(
  db: Db,
  actorId: string,
  accountId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const rows = await db.execute(
    sql`SELECT kind, user_id FROM email_accounts WHERE id=${accountId}`,
  );
  signal.throwIfAborted();
  const row = rows.rows[0] as { kind: string; user_id: string | null } | undefined;
  if (row?.kind === "team") return assertTeamMailboxAdmin(db, actorId, signal);
  return row?.user_id === actorId
    ? ok(undefined)
    : err(new AppError(ERROR_IDS.PERM_DENIED, "mailbox management denied", {}));
}
