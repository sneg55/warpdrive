import { and, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { activities } from "@/db/schema";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";
import { recomputeNextActivity } from "./nextActivity";
import { resolveActivityVisibility } from "./visibility";

// Soft-delete: mirrors completeActivity's gate order (load -> visibility 404 -> permission 403 ->
// mutate), but gates on "activity.delete" instead of "activity.complete". Unlike edit/complete,
// delete has no assignee exception (see can.ts): only the owner (with activity.delete_own/_any)
// or an admin may delete.
export async function deleteActivity(
  db: Db,
  actor: PermSetUser,
  id: string,
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.id, id), isNull(activities.deletedAt)));

    if (current === undefined) {
      return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity not found", { id }));
    }

    const vis = await resolveActivityVisibility(tx, current, signal);

    if (vis === null || !canSee(actor, vis)) {
      // Invisible: return 404-on-invisible, not 403.
      return err(new AppError(ERROR_IDS.ACTIVITY_NOT_FOUND, "activity not found", { id }));
    }

    if (!can(actor, "activity.delete", vis)) {
      return err(new AppError(ERROR_IDS.ACTIVITY_FORBIDDEN, "forbidden", { id }));
    }

    const [row] = await tx
      .update(activities)
      .set({ deletedAt: new Date() })
      .where(eq(activities.id, id))
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "activity delete returned no rows", {}));
    }

    if (row.dealId !== null) {
      await recomputeNextActivity(tx, row.dealId, signal);
    }

    return ok({ id: row.id });
  });
}
