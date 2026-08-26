"use client";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import {
  removeSavedFilterAction,
  toggleFavoriteAction,
} from "@/features/saved-filters/serverActions";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { BoardFilterMenu } from "./BoardFilterMenu";
import { BoardOwnerMenu } from "./BoardOwnerMenu";
import type { BoardOwner } from "./boardFilter";
import { CreateFilterModal } from "./CreateFilterModal";
import { rowToView, type SavedFilterView } from "./savedFilterView";

interface BoardFilterControlProps {
  owners: BoardOwner[];
  // Pipeline stages, forwarded as the value options for a Stage condition.
  stages?: ReadonlyArray<{ id: string; name: string }>;
  selectedOwnerId: string | null;
  // The signed-in user's id, forwarded so the owner list marks their row "(my)".
  currentUserId?: string;
  onSelectOwner: (ownerId: string | null) => void;
  selectedFilterId: string | null;
  // Reports the saved filter to apply server-side (or null to clear).
  onSelectFilter: (filter: SavedFilterView | null) => void;
  // The ad-hoc definition applied to the board, so the menu can say the board is filtered and
  // the builder reopens on it instead of a blank "match all" form.
  appliedDefinition?: FilterDefinition | null;
  // Applies the built conditions ad-hoc (null clears them).
  onApplyDefinition?: (definition: FilterDefinition | null) => void;
  // Applied ad-hoc condition count, for the Filter trigger badge.
  activeCount?: number;
  // Trigger copy, so the deals list (which keeps its own ad-hoc builder) can name its menu for
  // the saved filters it actually owns.
  triggerLabel?: string;
  // Applies an in-progress (unsaved) filter definition to the board for live preview.
  onPreviewFilter?: (definition: FilterDefinition) => void;
  // Clears any active preview so the board reverts to the applied saved filter.
  onClearPreview?: () => void;
}

export function BoardFilterControl(props: BoardFilterControlProps): React.ReactNode {
  const { owners, stages, selectedOwnerId, currentUserId, onSelectOwner } = props;
  const { selectedFilterId, onSelectFilter, onPreviewFilter, onClearPreview } = props;
  const { appliedDefinition = null, onApplyDefinition, activeCount = 0, triggerLabel } = props;
  const utils = trpc.useUtils();
  const reportError = useActionError();
  const query = trpc.deal.savedFilters.useQuery(undefined, { staleTime: 10_000 });
  const [modalOpen, setModalOpen] = useState(false);
  const saved: SavedFilterView[] = (query.data ?? []).map(rowToView);
  // The selected filter is what the board is showing, so the builder opens on it rather than on a
  // blank "match all" form that would misreport an "any condition" filter and overwrite it.
  const selectedFilter = saved.find((f) => f.id === selectedFilterId);

  async function toggleFav(id: string): Promise<void> {
    const r = await toggleFavoriteAction(id, readCsrfToken());
    if (!r.ok) reportError(r.error.id);
    // Invalidate either way: on failure the refetch reverts the star to its persisted state.
    await utils.deal.savedFilters.invalidate();
  }

  async function removeFilter(id: string): Promise<void> {
    const r = await removeSavedFilterAction(id, readCsrfToken());
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    // Otherwise the board keeps filtering by a filter that no longer exists.
    if (selectedFilterId === id) onSelectFilter(null);
    await utils.deal.savedFilters.invalidate();
  }

  return (
    <>
      <BoardFilterMenu
        savedFilters={saved}
        selectedFilterId={selectedFilterId}
        appliedDefinition={appliedDefinition}
        activeCount={activeCount}
        triggerLabel={triggerLabel}
        ownerFiltered={selectedOwnerId !== null}
        onSelectFilter={onSelectFilter}
        onClearConditions={() => onApplyDefinition?.(null)}
        onClearOwner={() => onSelectOwner(null)}
        onToggleFavorite={(id) => void toggleFav(id)}
        onDeleteFilter={(id) => void removeFilter(id)}
        onCreateFilter={() => setModalOpen(true)}
      />
      <BoardOwnerMenu
        owners={owners}
        selectedOwnerId={selectedOwnerId}
        currentUserId={currentUserId}
        onSelectOwner={onSelectOwner}
      />
      {modalOpen && (
        <CreateFilterModal
          owners={owners}
          stages={stages}
          onPreview={onPreviewFilter}
          savedFilter={selectedFilter}
          initialDefinition={appliedDefinition ?? undefined}
          onApply={
            onApplyDefinition === undefined
              ? undefined
              : (definition) => {
                  // The reads resolve the ad-hoc definition ahead of the saved filter, so leaving
                  // the selection set would show these edits while the menu named the saved row.
                  onSelectFilter(null);
                  onApplyDefinition(definition.conditions.length > 0 ? definition : null);
                  setModalOpen(false);
                }
          }
          onClose={() => {
            onClearPreview?.();
            setModalOpen(false);
          }}
          onSave={(persisted) => {
            void utils.deal.savedFilters.invalidate();
            onSelectFilter({
              id: persisted.id,
              name: persisted.name,
              // An update keeps the row's star; a new filter starts unstarred.
              favorite: selectedFilter?.id === persisted.id ? selectedFilter.favorite : false,
              isShared: persisted.isShared,
              isOwn: true,
              definition: persisted.definition,
            });
            // The saved filter now drives the board; drop the transient preview.
            onClearPreview?.();
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
