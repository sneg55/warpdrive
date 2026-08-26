// The shapes a caller hands the saved-filter actions, plus the guard that turns a stored
// target_entity string back into one of the four entities. Every definition here is `unknown`: the
// zod schemas are the single boundary that decides which entity's field allow-list validates it.
import { SAVED_FILTER_TARGET_ENTITIES, type SavedFilterTargetEntity } from "./schemas";

// Minimal session shape required by this feature: only the fields the actions need.
export interface FilterSession {
  userId: string;
  isAdmin: boolean;
  flags: Record<string, boolean>;
}

export interface SaveFilterArgs {
  name: string;
  targetEntity: SavedFilterTargetEntity;
  definition: unknown;
  isShared?: boolean;
}

export interface SavedFilterPatch {
  name?: string;
  definition?: unknown;
  isShared?: boolean;
}

export function asTargetEntity(value: string): SavedFilterTargetEntity | null {
  const known: readonly string[] = SAVED_FILTER_TARGET_ENTITIES;
  return known.includes(value) ? (value as SavedFilterTargetEntity) : null;
}
