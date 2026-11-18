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
  allLabel: string;
  currentDefinition: SavedViewDefinition | null;
  selectedViewId: string | null;
  onSelectView: (view: SavedView | null) => void;
}

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
    await utils.savedFilters.listByTarget.invalidate({ targetEntity });
  }

  async function removeView(id: string): Promise<void> {
    const r = await removeSavedFilterAction(id, readCsrfToken());
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
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
