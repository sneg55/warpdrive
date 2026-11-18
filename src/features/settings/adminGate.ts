import { ERROR_IDS } from "@/constants/errorIds";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";

export function requireManage(actor: PermSetUser | null): Result<PermSetUser, { id: string }> {
  if (actor === null) return err({ id: ERROR_IDS.AUTH_SESSION_DEAD });
  if (!can(actor, "permissions.manage")) return err({ id: ERROR_IDS.PERM_DENIED });
  return ok(actor);
}
