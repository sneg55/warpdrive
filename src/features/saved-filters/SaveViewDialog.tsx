"use client";
import type React from "react";
import { useId, useState } from "react";
import { type ActionErrorContent, actionErrorContent } from "@/components/shell/actionError";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { SavedView, SavedViewDefinition } from "./savedView";
import type { SavedFilterTargetEntity } from "./schemas";
import { createSavedFilterAction } from "./serverActions";

// One copy for both the checkbox's accessible name and its visible <label>.
const SHARED_LABEL = "Shared with everyone";

interface SaveViewDialogProps {
  targetEntity: SavedFilterTargetEntity;
  // The conditions currently applied to the list, persisted as the body of the new view.
  definition: SavedViewDefinition;
  onClose: () => void;
  onSaved: (view: SavedView) => void;
}

// Names the currently applied conditions and persists them as a saved view for this entity. The
// share checkbox is gated server-side by filter.share; a denial is surfaced here, not swallowed.
export function SaveViewDialog({
  targetEntity,
  definition,
  onClose,
  onSaved,
}: SaveViewDialogProps): React.ReactNode {
  const nameId = useId();
  const sharedId = useId();
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [error, setError] = useState<ActionErrorContent | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    const viewName = name.trim() === "" ? "Untitled view" : name.trim();
    setSaving(true);
    const res = await createSavedFilterAction(
      { name: viewName, targetEntity, definition, isShared },
      readCsrfToken(),
    );
    setSaving(false);
    if (!res.ok) {
      setError(actionErrorContent(res.error.id));
      return;
    }
    onSaved({
      id: res.value.id,
      name: viewName,
      favorite: false,
      isShared,
      isOwn: true,
      definition,
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save current view</DialogTitle>
        </DialogHeader>
        <label className="block text-sm" htmlFor={nameId}>
          <span className="mb-1 block font-medium">View name</span>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this view"
          />
        </label>
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id={sharedId}
            label={SHARED_LABEL}
            checked={isShared}
            onCheckedChange={setIsShared}
          />
          <label htmlFor={sharedId}>{SHARED_LABEL}</label>
        </div>
        {error !== null && (
          <div role="alert" className="text-sm text-red-600">
            <p className="font-medium">{error.title}</p>
            <p>{error.body}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
