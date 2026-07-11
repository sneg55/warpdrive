import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser } from "@/features/permissions/types";
import { toVisiblePerson } from "./linking";

export interface ThreadVisibilityRow {
  accountId: string;
  visibility: string;
  dealId: string | null;
  personId: string | null;
  // The mailbox owner's user id, when the caller has ALREADY joined email_accounts and can supply
  // it. Purely an optimisation: it must be the same value this function would read from
  // email_accounts.user_id for accountId, and it is only ever used to grant the owner their own
  // mailbox. Callers that cannot prove that must omit it and let the lookup happen here.
  ownerUserId?: string;
}

// THE mailbox-privacy rule (data-model 675). NOTE: there is NO admin bypass here.
// Mailboxes are more private than CRM records: even an admin cannot read a private
// thread they do not own. Only the shared-thread path defers to canSee (which does
// have an admin bypass for the LINKED deal/person, by design).
export async function canSeeEmail(
  db: Db,
  actor: AuthUser,
  thread: ThreadVisibilityRow,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();

  // a. The mailbox owner sees their own mailbox at any visibility. List callers that already
  // joined email_accounts pass ownerUserId, which avoids one lookup per row (listInbox over a
  // large mailbox was issuing a query per thread here).
  let ownerUserId = thread.ownerUserId;
  if (ownerUserId === undefined) {
    const owner = (
      await db.execute(sql`SELECT user_id FROM email_accounts WHERE id=${thread.accountId}`)
    ).rows[0] as { user_id: string } | undefined;
    signal.throwIfAborted();
    ownerUserId = owner?.user_id;
  }
  if (ownerUserId !== undefined && ownerUserId === actor.id) return true;

  // b. A private thread is visible ONLY to the owner. No admin bypass.
  if (thread.visibility === "private") return false;

  // c. A shared thread is visible iff the actor can see the linked deal OR person.
  if (thread.dealId !== null && (await canSeeLinkedDeal(db, actor, thread.dealId, signal))) {
    return true;
  }
  if (thread.personId !== null && (await canSeeLinkedPerson(db, actor, thread.personId, signal))) {
    return true;
  }
  return false;
}

// Pipeline-leak guard: load the deal JOINED to its pipeline and route through
// toVisibleDeal(row, pipeline.visibilityGroupId) before canSee. Never spread a raw deal
// row into canSee (a deal row carries no pipelineVisibilityGroupId, so the pipeline
// restriction gate would fail open). Same pattern as linking.ts.
export async function canSeeLinkedDeal(
  db: Db,
  actor: AuthUser,
  dealId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const row = (
    await db.execute(sql`
      SELECT d.owner_id, d.visibility_level, d.visibility_group_id, d.visible_to_user_ids,
             p.visibility_group_id AS pipeline_vg
      FROM deals d JOIN pipelines p ON p.id = d.pipeline_id
      WHERE d.id=${dealId} AND d.deleted_at IS NULL AND p.is_archived = false
    `)
  ).rows[0] as
    | {
        owner_id: string;
        visibility_level: string;
        visibility_group_id: string | null;
        visible_to_user_ids: string[];
        pipeline_vg: string | null;
      }
    | undefined;
  signal.throwIfAborted();
  if (row === undefined) return false;
  const visibleDeal = toVisibleDeal(
    {
      ownerId: row.owner_id,
      visibilityLevel: row.visibility_level as never,
      visibilityGroupId: row.visibility_group_id,
      visibleToUserIds: row.visible_to_user_ids,
    },
    row.pipeline_vg,
  );
  return canSee(actor, visibleDeal);
}

export async function canSeeLinkedPerson(
  db: Db,
  actor: AuthUser,
  personId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const row = (
    await db.execute(sql`
      SELECT owner_id, visibility_level, visibility_group_id, visible_to_user_ids
      FROM persons WHERE id=${personId} AND deleted_at IS NULL
    `)
  ).rows[0] as
    | {
        owner_id: string | null;
        visibility_level: string;
        visibility_group_id: string | null;
        visible_to_user_ids: string[];
      }
    | undefined;
  signal.throwIfAborted();
  if (row === undefined) return false;
  return canSee(
    actor,
    toVisiblePerson({
      ownerId: row.owner_id,
      visibilityLevel: row.visibility_level as never,
      visibilityGroupId: row.visibility_group_id,
      visibleToUserIds: row.visible_to_user_ids,
    }),
  );
}
