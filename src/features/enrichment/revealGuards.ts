import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Organization } from "@/db/schema";
import { toVisibleRecord } from "@/features/contacts/orgsRepo";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import { err, ok, type Result } from "@/types/result";

export function authoriseReveal(
  actor: ContactActor,
  org: Organization | null,
): Result<Organization, AppError> {
  if (org === null) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "organization not found", {}));
  }
  if (!canSee(actor, toVisibleRecord(org))) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "organization not found", {}));
  }
  if (!can(actor, "contact.create")) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.create required", {}));
  }
  return ok(org);
}
