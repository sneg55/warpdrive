import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { type InboxThread, toInboxThread } from "./emailReads";
import { canSeeEmail } from "./emailVisibility";

interface ThreadRow {
  id: string;
  subject: string | null;
  last_message_at: string | null;
  person_id: string | null;
  deal_id: string | null;
  visibility: string;
  account_id: string;
  follow_up_status: string | null;
  labels: string[];
}

// Filter a candidate thread set through THE mailbox-privacy rule (canSeeEmail): the owner
// sees their own private/shared threads; a non-owner sees a shared thread only when they can
// see its linked deal or person. Same in-memory filtering the Inbox uses. Each row's check is
// independent, so they run in parallel (Promise.all) instead of one serial round-trip per row;
// the visible rows are re-emitted in the original (newest-first) order the SQL returned.
async function filterVisible(
  db: Db,
  actor: AuthUser,
  rows: ThreadRow[],
  signal: AbortSignal,
): Promise<InboxThread[]> {
  const visibility = await Promise.all(
    rows.map((t) =>
      canSeeEmail(
        db,
        actor,
        {
          accountId: t.account_id,
          visibility: t.visibility,
          dealId: t.deal_id,
          personId: t.person_id,
        },
        signal,
      ),
    ),
  );
  // The deal/contact Email tab is a chrome-less "linked" view with no per-row privacy toggle, so
  // isOwner stays false here (no actorId passed). Explicit arrow so map's index is not read as one.
  return rows.filter((_, i) => visibility[i] === true).map((r) => toInboxThread(r));
}

// Threads linked to an entity column (deal_id or person_id), newest activity first, filtered to
// what the actor may see. The deal and contact reads are identical except for this column, so both
// funnel through here; the column is a fixed identifier (never user input), so interpolating it is
// safe. The linked value is passed as a bound parameter.
async function listThreadsBy(
  db: Db,
  column: "deal_id" | "person_id",
  value: string,
  actor: AuthUser,
  signal: AbortSignal,
): Promise<InboxThread[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT id, subject, last_message_at, person_id, deal_id, visibility, account_id,
        follow_up_status, labels
      FROM email_threads WHERE ${sql.raw(column)} = ${value} AND trashed_at IS NULL
      ORDER BY last_message_at DESC NULLS LAST
    `)
  ).rows as unknown as ThreadRow[];
  signal.throwIfAborted();
  return filterVisible(db, actor, rows, signal);
}

// Threads linked to a deal (email_threads.deal_id). Used by the deal workspace Email tab.
export function listThreadsForDeal(
  db: Db,
  args: { actor: AuthUser; dealId: string },
  signal: AbortSignal,
): Promise<InboxThread[]> {
  return listThreadsBy(db, "deal_id", args.dealId, args.actor, signal);
}

// Threads linked to a person (email_threads.person_id). Used by the contact detail Email tab.
export function listThreadsForContact(
  db: Db,
  args: { actor: AuthUser; personId: string },
  signal: AbortSignal,
): Promise<InboxThread[]> {
  return listThreadsBy(db, "person_id", args.personId, args.actor, signal);
}
