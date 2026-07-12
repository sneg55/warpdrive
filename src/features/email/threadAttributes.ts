import { sql } from "drizzle-orm";
import type { MAIL_FOLLOW_UP_STATUS } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { findUnknownMailLabelKeys } from "./mailLabelsRepo";

export type MailFollowUpStatus = (typeof MAIL_FOLLOW_UP_STATUS)[number];

// node-postgres does not auto-encode a bare JS array parameter as a Postgres array literal
// for db.execute (raw sql tag), unlike inserts through the drizzle query builder. Build the
// ARRAY[...] literal explicitly, same pattern as buildUuidArray in permissions/sql.ts.
function buildTextArray(values: string[]): ReturnType<typeof sql> {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  const parts = values.map((v) => sql`${v}::text`);
  const joined = parts.reduce((acc, part) => sql`${acc}, ${part}`);
  return sql`ARRAY[${joined}]`;
}

// Owner-scoped UPDATE shared by both setters below (mirrors setArchivedAt in threadArchive.ts).
// Missing and not-owned both return E_GMAIL_011 (404-on-invisible), matching getThread's privacy
// shape. Local only (B1): no Gmail label write.
async function updateOwnedThread(
  db: Db,
  actor: AuthUser,
  threadId: string,
  set: ReturnType<typeof sql>,
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  signal.throwIfAborted();
  const row = (
    await db.execute(sql`
      UPDATE email_threads t
      SET ${set}
      FROM email_accounts a
      WHERE t.account_id = a.id AND t.id = ${threadId} AND a.user_id = ${actor.id}
      RETURNING t.id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined)
    return err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));
  return ok({ threadId: row.id });
}

export function setFollowUpStatus(
  db: Db,
  args: { actor: AuthUser; threadId: string; status: MailFollowUpStatus },
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  return updateOwnedThread(
    db,
    args.actor,
    args.threadId,
    sql`follow_up_status = ${args.status}`,
    signal,
  );
}

export async function setThreadLabels(
  db: Db,
  // labels are mail-label catalog keys (built-in tokens like "important" or custom slugs), not a
  // fixed enum: the catalog is user-managed (U6). Shape/dedupe is validated at the action; here we
  // reject any key that has no catalog row so a stray token can never persist as invisible,
  // unremovable metadata (resolveMailLabelChips silently drops unknown keys on read).
  args: { actor: AuthUser; threadId: string; labels: string[] },
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  const unknown = await findUnknownMailLabelKeys(db, args.labels, signal);
  if (unknown.length > 0)
    return err(
      new AppError(ERROR_IDS.GMAIL_MAIL_LABEL_UNKNOWN, "unknown mail label key(s)", {
        keys: unknown,
      }),
    );
  return updateOwnedThread(
    db,
    args.actor,
    args.threadId,
    sql`labels = ${buildTextArray(args.labels)}`,
    signal,
  );
}
