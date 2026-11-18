import type { FilterDefinition } from "@/features/saved-filters/schemas";

export interface SavedFilterView {
  id: string;
  name: string;
  favorite: boolean;
  isShared: boolean;
  isOwn: boolean;
  definition: FilterDefinition;
}

interface SavedFilterRow {
  id: string;
  name: string;
  favorite: boolean;
  isShared: boolean;
  isOwn: boolean;
  definition: FilterDefinition;
}

export function rowToView(row: SavedFilterRow): SavedFilterView {
  return {
    id: row.id,
    name: row.name,
    favorite: row.favorite,
    isShared: row.isShared,
    isOwn: row.isOwn,
    definition: row.definition,
  };
}
