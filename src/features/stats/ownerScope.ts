import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";

// stats.viewOthers widens owner scope only; it can never surface an invisible record
// because the visibility predicate always runs independently of this helper.
// Permissions spec 6.6: scope gating is orthogonal to record-level visibility.
export function ownerScope(actor: PermSetUser, requested: "me" | "all"): "me" | "all" {
  if (requested === "me") return "me";
  return can(actor, "stats.viewOthers") ? "all" : "me";
}
