import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser } from "@/features/permissions/types";
import { toVisiblePerson } from "./linking";
import { canUseMailbox } from "./mailboxAccess";

export interface ThreadVisibilityRow {
  accountId: string;
  visibility: string;
  dealId: string | null;
  personId: string | null;
  ownerUserId?: string | null;
}

export async function canSeeEmail(
  db: Db,
  actor: AuthUser,
  thread: ThreadVisibilityRow,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();

  let ownerUserId = thread.ownerUserId;
  if (ownerUserId === undefined) {
    const owner = (
      await db.execute(sql`SELECT user_id FROM email_accounts WHERE id=${thread.accountId}`)
    ).rows[0] as { user_id: string | null } | undefined;
    signal.throwIfAborted();
    ownerUserId = owner?.user_id;
  }
  if (ownerUserId !== undefined && ownerUserId === actor.id) return true;

  if (ownerUserId == null && (await canUseMailbox(db, thread.accountId, actor.id, signal)))
    return true;

  if (thread.visibility === "private") return false;

  if (thread.dealId !== null && (await canSeeLinkedDeal(db, actor, thread.dealId, signal))) {
    return true;
  }
  if (thread.personId !== null && (await canSeeLinkedPerson(db, actor, thread.personId, signal))) {
    return true;
  }
  return false;
}

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
