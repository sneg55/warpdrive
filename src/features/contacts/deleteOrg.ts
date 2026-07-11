import { and, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import { err, ok, type Result } from "@/types/result";
import { toVisibleRecord } from "./orgsRepo";
import type { ContactActor } from "./personsRepo";

// Soft-delete an organization. Gates on canSee + contact.delete (a distinct,
// admin-configurable permission from contact.edit: REGULAR_DEFAULT_FLAGS grants
// contact.edit_own but intentionally withholds every delete flag, so an editor must not get
// delete for free). Visibility alone is not authority to mutate a record, and an
// invisible/already-deleted id 404s (CONTACT_NOT_FOUND) rather than 403ing, so a stranger
// cannot learn the record exists by attempting to delete it. Kept in its own file (not
// orgsRepo.ts) to stay under the project's file-size budget, mirroring deletePerson.ts.
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
