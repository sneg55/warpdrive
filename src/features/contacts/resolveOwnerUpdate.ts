import { and, eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import { mayTransferOwner } from "@/features/permissions/mayTransferOwner";
import type { VisibleRecord } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";

export function canTransferContactOwner(actor: PermSetUser, record: VisibleRecord): boolean {
  return mayTransferOwner(actor, record.ownerId) && can(actor, "contact.edit", record);
}

export async function resolveOwnerUpdate(
  db: Db,
  actor: PermSetUser,
  requested: string | undefined,
  currentOwnerId: string,
  signal: AbortSignal,
): Promise<Result<string, AppError>> {
  if (requested === undefined || requested === currentOwnerId) return ok(currentOwnerId);
  if (!mayTransferOwner(actor, currentOwnerId)) return ok(currentOwnerId);

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, requested), eq(users.isActive, true)));
  signal.throwIfAborted();
  if (target === undefined) {
    return err(
      new AppError(ERROR_IDS.USER_NOT_FOUND, "owner transfer target not found or inactive", {
        requested,
      }),
    );
  }
  return ok(target.id);
}
