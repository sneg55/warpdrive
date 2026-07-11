import { sql } from "drizzle-orm";
import type { EMAIL_VISIBILITY } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { canSeeEmail } from "./emailVisibility";
import { assertMailboxOwner } from "./mailboxOwnership";

export type EmailVisibility = (typeof EMAIL_VISIBILITY)[number];

// Per-thread privacy write (P5). Owner-gated via assertMailboxOwner (E_PERM_001 on a non-owner),
// so a co-viewer of a shared thread cannot flip its visibility. A thread the actor cannot see
// (missing, or private and not theirs) returns the same not-found error as a missing id, matching
// the 404-on-invisible pattern so the action never confirms a thread's existence to a non-owner.
// A visible-but-not-owned (shared) thread returns the distinct owner-only E_PERM_001, since the
// actor already knows it exists. Local only: no Gmail-side visibility concept to mirror.
export async function setThreadVisibility(
  db: Db,
  args: { actor: AuthUser; threadId: string; visibility: EmailVisibility },
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  signal.throwIfAborted();
  const notFound = err(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));
  const thread = (
    await db.execute(
      sql`SELECT account_id, visibility, deal_id, person_id FROM email_threads WHERE id = ${args.threadId}`,
    )
  ).rows[0] as
    | { account_id: string; visibility: string; deal_id: string | null; person_id: string | null }
    | undefined;
  if (thread === undefined) return notFound;

  const visible = await canSeeEmail(
    db,
    args.actor,
    {
      accountId: thread.account_id,
      visibility: thread.visibility,
      dealId: thread.deal_id,
      personId: thread.person_id,
    },
    signal,
  );
  if (!visible) return notFound;

  const owner = await assertMailboxOwner(db, thread.account_id, args.actor.id, signal);
  if (!owner.ok) return owner;

  await db.execute(
    sql`UPDATE email_threads SET visibility = ${args.visibility} WHERE id = ${args.threadId}`,
  );
  return ok({ threadId: args.threadId });
}
