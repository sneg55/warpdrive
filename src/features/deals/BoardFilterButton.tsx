"use client";
import { Filter } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import type { BoardOwner } from "./boardFilter";
import { CreateFilterModal } from "./CreateFilterModal";
import type { SavedFilterView } from "./savedFilterView";

interface BoardFilterButtonProps {
  owners: BoardOwner[];
  // Number of currently-applied ad-hoc conditions, for the trigger badge (0 hides it).
  activeCount: number;
  // Apply the built conditions ad-hoc (kept applied after close); null clears them.
  onApply: (definition: FilterDefinition | null) => void;
  // Live-preview the in-progress definition behind the open modal.
  onPreview: (definition: FilterDefinition) => void;
  // Clear a transient preview (on cancel/close) so the board reverts to the applied filter.
  onClearPreview: () => void;
  // Persist a named saved view and apply it.
  onSaveFilter: (view: SavedFilterView) => void;
}

// The board's single PD-parity "Filter" entry point: a funnel button that opens the rich
// condition builder (CreateFilterModal) with Apply (ad-hoc) + Save (named view) + live Preview.
// Replaces the former minimal inline popover and the separate quick-filter chip row.
export function BoardFilterButton({
  owners,
  activeCount,
  onApply,
  onPreview,
  onClearPreview,
  onSaveFilter,
}: BoardFilterButtonProps): React.ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Filter"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm transition hover:bg-accent"
      >
        <Filter aria-hidden="true" className="h-4 w-4" />
        Filter
        {activeCount > 0 ? (
          <span className="ml-0.5 rounded-full bg-primary px-1.5 text-primary-foreground text-xs">
            {activeCount}
          </span>
        ) : null}
      </button>
      {open && (
        <CreateFilterModal
          owners={owners}
          onPreview={onPreview}
          onApply={(def) => {
            onApply(def.conditions.length > 0 ? def : null);
            setOpen(false);
          }}
          onSave={(created) => {
            onSaveFilter({
              id: created.id,
              name: created.name,
              favorite: false,
              isShared: false,
              isOwn: true,
              definition: created.definition,
            });
            setOpen(false);
          }}
          onClose={() => {
            onClearPreview();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
