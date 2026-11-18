"use client";
import type React from "react";
import { useEffect, useState } from "react";
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
  stages?: ReadonlyArray<{ id: string; name: string }>;
  selectedOwnerId: string | null;
  currentUserId?: string;
  onSelectOwner: (ownerId: string | null) => void;
  selectedFilterId: string | null;
  appliedFilter?: SavedFilterView | null;
  onSelectFilter: (filter: SavedFilterView | null) => void;
  appliedDefinition?: FilterDefinition | null;
  onApplyDefinition?: (definition: FilterDefinition | null) => void;
  activeCount?: number;
  triggerLabel?: string;
  onPreviewFilter?: (definition: FilterDefinition) => void;
  onClearPreview?: () => void;
}

function sameSavedFilter(a: SavedFilterView, b: SavedFilterView): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    JSON.stringify(a.definition) === JSON.stringify(b.definition)
  );
}

export function BoardFilterControl(props: BoardFilterControlProps): React.ReactNode {
  const { owners, stages, selectedOwnerId, currentUserId, onSelectOwner } = props;
  const { selectedFilterId, appliedFilter, onSelectFilter } = props;
  const { onPreviewFilter, onClearPreview } = props;
  const { appliedDefinition = null, onApplyDefinition, activeCount = 0, triggerLabel } = props;
  const utils = trpc.useUtils();
  const reportError = useActionError();
  const query = trpc.deal.savedFilters.useQuery(undefined, { staleTime: 10_000 });
  const [modalOpen, setModalOpen] = useState(false);
  const saved: SavedFilterView[] = (query.data ?? []).map(rowToView);
  const selectedFilter = saved.find((f) => f.id === selectedFilterId);
  const rowsFresh = query.data !== undefined && !query.isFetching && !query.isStale;
  useEffect(() => {
    if (!rowsFresh || appliedFilter === undefined || appliedFilter === null) return;
    if (selectedFilter === undefined) {
      onSelectFilter(null);
      return;
    }
    if (!sameSavedFilter(selectedFilter, appliedFilter)) onSelectFilter(selectedFilter);
  }, [rowsFresh, appliedFilter, selectedFilter, onSelectFilter]);

  async function toggleFav(id: string): Promise<void> {
    const r = await toggleFavoriteAction(id, readCsrfToken());
    if (!r.ok) reportError(r.error.id);
    await utils.deal.savedFilters.invalidate();
  }

  async function removeFilter(id: string): Promise<void> {
    const r = await removeSavedFilterAction(id, readCsrfToken());
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    if (selectedFilterId === id) onSelectFilter(null);
    await utils.deal.savedFilters.invalidate();
  }

  return (
    <>
      <BoardFilterMenu
        savedFilters={saved}
        selectedFilterId={selectedFilterId}
        appliedFilterName={appliedFilter?.name}
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
              favorite: selectedFilter?.id === persisted.id ? selectedFilter.favorite : false,
              isShared: persisted.isShared,
              isOwn: true,
              definition: persisted.definition,
            });
            onClearPreview?.();
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
