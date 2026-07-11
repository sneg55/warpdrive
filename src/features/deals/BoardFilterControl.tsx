"use client";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { toggleFavoriteAction } from "@/features/saved-filters/serverActions";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { BoardFilterMenu } from "./BoardFilterMenu";
import type { BoardOwner } from "./boardFilter";
import { CreateFilterModal } from "./CreateFilterModal";
import { rowToView, type SavedFilterView } from "./savedFilterView";

interface BoardFilterControlProps {
  owners: BoardOwner[];
  selectedOwnerId: string | null;
  // The signed-in user's id, forwarded so the Owners list marks their row "(my)".
  currentUserId?: string;
  onSelectOwner: (ownerId: string | null) => void;
  selectedFilterId: string | null;
  // Reports the saved filter to apply server-side (or null to clear).
  onSelectFilter: (filter: SavedFilterView | null) => void;
  // Applies an in-progress (unsaved) filter definition to the board for live preview.
  onPreviewFilter?: (definition: FilterDefinition) => void;
  // Clears any active preview so the board reverts to the applied saved filter.
  onClearPreview?: () => void;
}

export function BoardFilterControl(props: BoardFilterControlProps): React.ReactNode {
  const { owners, selectedOwnerId, currentUserId, onSelectOwner } = props;
  const { selectedFilterId, onSelectFilter, onPreviewFilter, onClearPreview } = props;
  const utils = trpc.useUtils();
  const reportError = useActionError();
  const query = trpc.deal.savedFilters.useQuery(undefined, { staleTime: 10_000 });
  const [modalOpen, setModalOpen] = useState(false);
  const saved: SavedFilterView[] = (query.data ?? []).map(rowToView);

  async function toggleFav(id: string): Promise<void> {
    const r = await toggleFavoriteAction(id, readCsrfToken());
    if (!r.ok) reportError(r.error.id);
    // Invalidate either way: on failure the refetch reverts the star to its persisted state.
    await utils.deal.savedFilters.invalidate();
  }

  return (
    <>
      <BoardFilterMenu
        owners={owners}
        selectedOwnerId={selectedOwnerId}
        currentUserId={currentUserId}
        onSelectOwner={onSelectOwner}
        savedFilters={saved}
        selectedFilterId={selectedFilterId}
        onSelectFilter={onSelectFilter}
        onToggleFavorite={(id) => void toggleFav(id)}
        onCreateFilter={() => setModalOpen(true)}
      />
      {modalOpen && (
        <CreateFilterModal
          owners={owners}
          onPreview={onPreviewFilter}
          onClose={() => {
            onClearPreview?.();
            setModalOpen(false);
          }}
          onSave={(created) => {
            void utils.deal.savedFilters.invalidate();
            onSelectFilter({
              id: created.id,
              name: created.name,
              favorite: false,
              isShared: false,
              isOwn: true,
              definition: created.definition,
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
