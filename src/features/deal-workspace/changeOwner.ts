// changeOwner: permission-gated deal owner reassignment for the deal header.
// loadEditableDeal enforces edit access; a SECOND gate (deal.changeOwner) is required
// because reassigning ownership is a stronger capability than editing fields. Mirrors the
// create path's owner-override gate (resolveOwnerId) so ownership can never be spoofed.
import { and, eq, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Deal } from "@/db/schema/deals";
import { deals } from "@/db/schema/deals";
import { users } from "@/db/schema/identity";
import { recordChange } from "@/features/collaboration/changeLog";
import { loadEditableDeal, toVisibleDeal } from "@/features/deals/dealAuth";
import { changeOwnerInput } from "@/features/deals/schemas";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";

export async function changeOwner(
  db: Db,
  actor: PermSetUser,
  raw: unknown,
  signal: AbortSignal,
): Promise<Result<Deal, AppError>> {
  const input = changeOwnerInput.parse(raw);
  signal.throwIfAborted();

  const editable = await loadEditableDeal(db, actor, input.dealId, signal);
  if (editable.ok === false) return editable;
  const { deal, pipelineVisibilityGroupId } = editable.value;

  // Ownership reassignment gate: same capability the create path honors for owner override.
  if (!can(actor, "deal.changeOwner", toVisibleDeal(deal, pipelineVisibilityGroupId))) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "Not permitted to change this deal's owner", {
        userId: actor.id,
        dealId: input.dealId,
      }),
    );
  }
  signal.throwIfAborted();

  // The new owner must exist and be active (no reassigning to a disabled account).
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, input.ownerId), eq(users.isActive, true)));
  if (target === undefined) {
    return err(
      new AppError(ERROR_IDS.USER_NOT_FOUND, "New owner not found or inactive", {
        ownerId: input.ownerId,
      }),
    );
  }
  signal.throwIfAborted();

  const expectedIso = input.expectedUpdatedAt;

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(deals)
      .set({ ownerId: input.ownerId, updatedAt: new Date() })
      .where(
        and(
          eq(deals.id, input.dealId),
          sql`date_trunc('milliseconds', ${deals.updatedAt}) = ${expectedIso}::timestamptz`,
        ),
      )
      .returning();

    if (updated.length === 0) {
      return err(
        new AppError(ERROR_IDS.DEAL_PRECONDITION, "Deal was modified by a concurrent request", {
          dealId: input.dealId,
        }),
      );
    }

    const row = updated[0];
    if (row === undefined) {
      throw new AppError(
        ERROR_IDS.DB_INVARIANT,
        "changeOwner: UPDATE RETURNING produced undefined",
      );
    }

    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: input.dealId,
        field: "ownerId",
        oldValue: deal.ownerId,
        newValue: row.ownerId,
        actorId: actor.id,
      },
      signal,
    );

    return ok(row);
  });
}
