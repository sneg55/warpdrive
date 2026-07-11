import { and, eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import type { VisibleRecord } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";

// May this actor transfer ownership of a record currently owned by currentOwnerId? deal.changeOwner
// is the generic owner-assign capability (ownership-scoped, stored as _own/_any pairs): _any reassigns
// any record, _own only records the actor already owns; admin is unconditional. Shared by the server
// resolver below and the detail-page loaders so the write gate and the UI gate can never diverge.
export function mayTransferOwner(actor: PermSetUser, currentOwnerId: string | null): boolean {
  if (actor.type === "admin") return true;
  if (actor.flags.has("deal.changeOwner_any")) return true;
  return actor.flags.has("deal.changeOwner_own") && currentOwnerId === actor.id;
}

// Whether to SHOW the owner-transfer control on a contact. mayTransferOwner alone is not enough: the
// write path (updatePerson/updateOrg) rejects at its contact.edit gate before resolveOwnerUpdate
// runs, so a user with deal.changeOwner but not contact.edit would see a control that silently does
// nothing. Gate the UI on both so it never diverges from what the server will honor.
export function canTransferContactOwner(actor: PermSetUser, record: VisibleRecord): boolean {
  return mayTransferOwner(actor, record.ownerId) && can(actor, "contact.edit", record);
}

// Gate for transferring a contact's owner on update (CO-3). A requested owner change is applied only
// when mayTransferOwner allows it and the target user exists; otherwise the current owner is kept (a
// client injecting ownerId into a plain inline edit cannot reassign the record). Silent-ignore, not
// an error, so ordinary edits that happen to echo the current owner never fail.
export async function resolveOwnerUpdate(
  db: Db,
  actor: PermSetUser,
  requested: string | undefined,
  currentOwnerId: string,
  signal: AbortSignal,
): Promise<Result<string, AppError>> {
  if (requested === undefined || requested === currentOwnerId) return ok(currentOwnerId);
  if (!mayTransferOwner(actor, currentOwnerId)) return ok(currentOwnerId);

  // Only active users may own a record: the deal/lead owner-change paths enforce isActive too, and
  // the UI lists active users only, so a directly-posted inactive UUID must be rejected, not assigned.
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
