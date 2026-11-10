import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { TEAM_MAILBOX_INTENT_MAX_AGE, TEAM_MAILBOX_INTENT_PREFIX } from "@/constants/teamMailbox";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { assertTeamMailboxAdmin } from "./teamMailboxConnect";

export async function createTeamMailboxIntent(
  db: Db,
  args: { actorId: string; sessionId: string; backfillDays: number },
  signal: AbortSignal,
): Promise<Result<string, AppError>> {
  const allowed = await assertTeamMailboxAdmin(db, args.actorId, signal);
  if (!allowed.ok) return allowed;
  const state = `${TEAM_MAILBOX_INTENT_PREFIX}${randomUUID()}`;
  const result =
    await db.execute(sql`INSERT INTO email_oauth_intents (state, session_id, backfill_days, expires_at)
    SELECT ${state}, id, ${args.backfillDays}, now() + ${TEAM_MAILBOX_INTENT_MAX_AGE} * interval '1 second'
    FROM sessions WHERE id=${args.sessionId} AND user_id=${args.actorId} AND revoked_at IS NULL AND expires_at>now() RETURNING state`);
  signal.throwIfAborted();
  return result.rows.length > 0
    ? ok(state)
    : err(new AppError(ERROR_IDS.PERM_DENIED, "session not found", {}));
}

export async function consumeTeamMailboxIntent(
  db: Db,
  state: string,
  sessionId: string,
  signal: AbortSignal,
): Promise<{ backfillDays: number } | null> {
  signal.throwIfAborted();
  const result = await db.execute(
    sql`DELETE FROM email_oauth_intents WHERE state=${state} AND session_id=${sessionId} AND expires_at>now() RETURNING backfill_days`,
  );
  signal.throwIfAborted();
  const row = result.rows[0] as { backfill_days: number } | undefined;
  return row === undefined ? null : { backfillDays: row.backfill_days };
}
