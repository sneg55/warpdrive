// Client-side view of an AST saved_filters row: the fields the board filter UI needs. The jsonb
// definition is parsed server-side (trpc.deal.savedFilters via parseSavedFilterDefinition), so this
// module stays zod-free and no longer drags zod into the board bundle.
import type { FilterDefinition } from "@/features/saved-filters/schemas";

export interface SavedFilterView {
  id: string;
  name: string;
  favorite: boolean;
  isShared: boolean;
  // True when the session user owns this filter. Only owners can toggle its favorite flag (the
  // flag is a per-row, owner-scoped column), so the UI hides the star for others' shared filters.
  isOwn: boolean;
  definition: FilterDefinition;
}

// Row shape as returned by trpc.deal.savedFilters (saved_filters.$inferSelect subset + isOwn).
// definition arrives already parsed to a trusted FilterDefinition by the server procedure.
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
