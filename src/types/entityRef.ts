import type { ENTITY_TYPES } from "@/constants/entityTypes";

export interface EntityRef {
  kind: "person" | "organization" | "deal" | "lead" | "user";
  id: string;
}

export type EntityType = (typeof ENTITY_TYPES)[number];
