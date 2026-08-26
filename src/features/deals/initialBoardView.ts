import type { UiPrefs } from "@/features/identity/preferencesSchema";
import { type BoardViewState, boardViewFromPref, DEFAULT_BOARD_VIEW } from "./boardView";
import type { SavedFilterView } from "./savedFilterView";

// Rebuilds the board toolbar view the server render must start from. The saved-filter loader is a
// callback so it only runs when a filter id is actually stored: a board with no persisted filter
// costs no extra query.
export async function resolveInitialBoardView(
  ui: UiPrefs,
  loadSavedFilters: () => Promise<readonly SavedFilterView[]>,
): Promise<BoardViewState> {
  const stored = ui.boardView;
  if (stored === undefined) return DEFAULT_BOARD_VIEW;
  const visible = stored.savedFilterId === null ? [] : await loadSavedFilters();
  return boardViewFromPref(stored, visible);
}
