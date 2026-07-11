import { ERROR_IDS } from "@/constants/errorIds";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";

// Shared admin gate for every company-catalog mutation (settings, activity types, lost
// reasons, labels). Mirrors the built admin pages: admins pass; regular users need the
// permissions.manage flag. Kept in a non-"use server" module so it is directly unit-testable
// with a synthetic actor (no createContext/cookie mocking needed).
export function requireManage(actor: PermSetUser | null): Result<PermSetUser, { id: string }> {
  if (actor === null) return err({ id: ERROR_IDS.AUTH_SESSION_DEAD });
  if (!can(actor, "permissions.manage")) return err({ id: ERROR_IDS.PERM_DENIED });
  return ok(actor);
}
