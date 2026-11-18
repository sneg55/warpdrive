import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import {
  canSeeEmail,
  canSeeLinkedDeal,
  canSeeLinkedPerson,
  type ThreadVisibilityRow,
} from "./emailVisibility";
import { assertMailboxOwner } from "./mailboxOwnership";

export interface ApplyThreadLinkArgs {
  actor: AuthUser;
  threadId: string;
  personId?: string | null;
  dealId?: string | null;
}

export async function applyThreadLink(
  db: Db,
  args: ApplyThreadLinkArgs,
  signal: AbortSignal,
): Promise<Result<{ threadId: string }, AppError>> {
  signal.throwIfAborted();

  const thread = (
    await db.execute(
      sql`SELECT account_id, visibility, deal_id, person_id FROM email_threads WHERE id=${args.threadId}`,
    )
  ).rows[0] as
    | { account_id: string; visibility: string; deal_id: string | null; person_id: string | null }
    | undefined;
  signal.throwIfAborted();
  const visRow: ThreadVisibilityRow | undefined =
    thread === undefined
      ? undefined
      : {
          accountId: thread.account_id,
          visibility: thread.visibility,
          dealId: thread.deal_id,
          personId: thread.person_id,
        };
  if (visRow === undefined || !(await canSeeEmail(db, args.actor, visRow, signal))) {
    return err(new AppError("E_GMAIL_011", "thread not found", {}));
  }

  const owner = await assertMailboxOwner(db, visRow.accountId, args.actor.id, signal);
  if (!owner.ok) {
    return err(new AppError("E_PERM_001", "not allowed to relink this thread", {}));
  }

  if (args.personId !== null && args.personId !== undefined) {
    if (!(await canSeeLinkedPerson(db, args.actor, args.personId, signal))) {
      return err(new AppError("E_PERM_001", "linked person not visible", {}));
    }
  }
  if (args.dealId !== null && args.dealId !== undefined) {
    if (!(await canSeeLinkedDeal(db, args.actor, args.dealId, signal))) {
      return err(new AppError("E_PERM_001", "linked deal not visible", {}));
    }
  }

  await db.execute(sql`
    UPDATE email_threads
    SET person_id = ${args.personId === undefined ? sql`person_id` : args.personId},
        deal_id = ${args.dealId === undefined ? sql`deal_id` : args.dealId},
        updated_at = now()
    WHERE id = ${args.threadId}
  `);
  signal.throwIfAborted();
  return ok({ threadId: args.threadId });
}
