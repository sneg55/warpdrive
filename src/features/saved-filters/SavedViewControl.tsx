"use client";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { SavedViewMenu } from "./SavedViewMenu";
import { SaveViewDialog } from "./SaveViewDialog";
import type { SavedView, SavedViewDefinition } from "./savedView";
import type { SavedFilterTargetEntity } from "./schemas";
import { removeSavedFilterAction, toggleFavoriteAction } from "./serverActions";

interface SavedViewControlProps {
  targetEntity: SavedFilterTargetEntity;
  // Copy for the row that clears the applied view, e.g. "All people".
  allLabel: string;
  // Conditions the list's filter builder currently has applied, offered as the body of a new view.
  currentDefinition: SavedViewDefinition | null;
  selectedViewId: string | null;
  onSelectView: (view: SavedView | null) => void;
}

// The saved-view affordance for the People, Orgs and Leads toolbars: pick a view (or clear it),
// star one, or save what the filter builder has applied as a new view. One control for all three,
// entity-scoped by targetEntity.
export function SavedViewControl({
  targetEntity,
  allLabel,
  currentDefinition,
  selectedViewId,
  onSelectView,
}: SavedViewControlProps): React.ReactNode {
  const utils = trpc.useUtils();
  const reportError = useActionError();
  const query = trpc.savedFilters.listByTarget.useQuery({ targetEntity }, { staleTime: 10_000 });
  const [saving, setSaving] = useState(false);
  const views: SavedView[] = query.data ?? [];
  const savable =
    currentDefinition !== null && currentDefinition.conditions.length > 0
      ? currentDefinition
      : null;

  async function toggleFav(id: string): Promise<void> {
    const r = await toggleFavoriteAction(id, readCsrfToken());
    if (!r.ok) reportError(r.error.id);
    // Invalidate either way: on failure the refetch reverts the star to its persisted state.
    await utils.savedFilters.listByTarget.invalidate({ targetEntity });
  }

  async function removeView(id: string): Promise<void> {
    const r = await removeSavedFilterAction(id, readCsrfToken());
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    // Otherwise the list keeps filtering by a view that no longer exists.
    if (selectedViewId === id) onSelectView(null);
    await utils.savedFilters.listByTarget.invalidate({ targetEntity });
  }

  return (
    <>
      <SavedViewMenu
        views={views}
        selectedViewId={selectedViewId}
        allRecordsActive={selectedViewId === null && currentDefinition === null}
        allLabel={allLabel}
        canSave={savable !== null}
        onSelect={onSelectView}
        onToggleFavorite={(id) => void toggleFav(id)}
        onDelete={(id) => void removeView(id)}
        onSaveCurrent={() => setSaving(true)}
      />
      {saving && savable !== null && (
        <SaveViewDialog
          targetEntity={targetEntity}
          definition={savable}
          onClose={() => setSaving(false)}
          onSaved={(view) => {
            void utils.savedFilters.listByTarget.invalidate({ targetEntity });
            onSelectView(view);
            setSaving(false);
          }}
        />
      )}
    </>
  );
}
