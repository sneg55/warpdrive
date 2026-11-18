import type { SavedViewDefinition } from "./savedView";
import {
  type FilterDefinition,
  filterDefinition,
  type SavedFilterTargetEntity,
  savedFilterDefinitionSchema,
} from "./schemas";

export function parseSavedFilterDefinition(raw: unknown): FilterDefinition {
  const parsed = filterDefinition.safeParse(raw);
  return parsed.success ? parsed.data : { conditions: [] };
}

export function parseSavedFilterDefinitionFor(
  targetEntity: SavedFilterTargetEntity,
  raw: unknown,
): SavedViewDefinition {
  const parsed = savedFilterDefinitionSchema(targetEntity).safeParse(raw);
  return parsed.success ? parsed.data : { combinator: "and", conditions: [] };
}
