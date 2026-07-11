import type { ENTITY_TYPES } from "@/constants/entityTypes";

// Canonical cross-phase reference shape (shared with Phase 3).
// One id plus its kind.
export interface EntityRef {
  kind: "person" | "organization" | "deal" | "lead" | "user";
  id: string;
}

export type EntityType = (typeof ENTITY_TYPES)[number];
