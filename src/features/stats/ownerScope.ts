import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import type { OwnerScope } from "@/types/stats";

const ME: OwnerScope = { kind: "me" };

export function ownerScope(actor: PermSetUser, requested: OwnerScope): OwnerScope {
  if (requested.kind === "me") return ME;
  if (requested.kind === "user" && requested.userId === actor.id) return ME;
  return can(actor, "stats.viewOthers") ? requested : ME;
}
