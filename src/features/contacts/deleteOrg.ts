import { and, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import { err, ok, type Result } from "@/types/result";
import { toVisibleRecord } from "./orgsRepo";
import type { ContactActor } from "./personsRepo";

export async function deleteOrg(
  db: Db,
  actor: ContactActor,
  id: string,
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();

    const [current] = await tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));

    if (current === undefined || canSee(actor, toVisibleRecord(current)) === false) {
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id }));
    }
    if (!can(actor, "contact.delete", toVisibleRecord(current))) {
      return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.delete required", { id }));
    }

    const [row] = await tx
      .update(organizations)
      .set({ deletedAt: new Date() })
      .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
      .returning({ id: organizations.id });

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "delete returned no rows", {}));
    }
    return ok(row);
  });
}
