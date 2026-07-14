"use client";
import type React from "react";
import { useId, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { createSavedFilterAction } from "@/features/saved-filters/serverActions";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { BoardOwner } from "./boardFilter";
import { blankRow, ConditionRows, describeRows, type Row } from "./CreateFilterRows";

interface CreateFilterModalProps {
  onClose: () => void;
  // Owners on the board, used to offer a value dropdown for the Owner condition field.
  owners?: BoardOwner[];
  // Applies the in-progress conditions to the board behind the modal, without persisting a filter.
  onPreview?: (definition: FilterDefinition) => void;
  // Applies the conditions ad-hoc (kept applied after the modal closes) without persisting a saved
  // filter. This is the PD "Filter" apply: filter now, save-as-view optional.
  onApply?: (definition: FilterDefinition) => void;
  // Reports the server-created filter so the parent can apply + select it by its real id.
  onSave: (created: { id: string; name: string; definition: FilterDefinition }) => void;
}

export function CreateFilterModal({
  onClose,
  owners = [],
  onPreview,
  onApply,
  onSave,
}: CreateFilterModalProps): React.ReactNode {
  const nameId = useId();
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [name, setName] = useState("");
  // Until the user types their own name, the field mirrors a name derived from the conditions.
  const [nameEdited, setNameEdited] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the name field shows and what a save uses: the user's name once edited, else the
  // auto-generated description of the current conditions.
  const autoName = describeRows(rows, owners);
  const effectiveName = nameEdited ? name : autoName;

  // The filter as currently edited: rows with a real value, minus incomplete ones. Shared by
  // Save (persist) and Preview (apply live without saving).
  function buildDefinition(): FilterDefinition {
    const conditions = rows
      .filter((r) => r.value.trim() !== "")
      .map((r) => ({ field: r.field, op: r.op, value: r.value }));
    return { conditions };
  }

  async function save(): Promise<void> {
    const definition = buildDefinition();
    const filterName = effectiveName.trim() === "" ? "Untitled filter" : effectiveName.trim();
    const res = await createSavedFilterAction(
      { name: filterName, targetEntity: "deal", definition, isShared },
      readCsrfToken(),
    );
    if (!res.ok) {
      setError(res.error.id);
      return;
    }
    onSave({ id: res.value.id, name: filterName, definition });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="max-w-2xl gap-0 overflow-hidden bg-card p-0"
      >
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-base font-semibold">Create new filter</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <ConditionRows rows={rows} setRows={setRows} owners={owners} />
          {error !== null ? (
            <p className="mt-2 text-sm text-red-600">Could not save ({error}).</p>
          ) : null}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium" id={nameId}>
                Filter name
              </span>
              <input
                aria-labelledby={nameId}
                aria-label="Filter name"
                value={effectiveName}
                onChange={(e) => {
                  setNameEdited(true);
                  setName(e.target.value);
                }}
                placeholder="Named from your conditions"
                className="w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </label>
            <div className="flex items-center gap-2 self-end pb-1.5 text-sm">
              <Checkbox label="Shared" checked={isShared} onCheckedChange={setIsShared} />
              <span>Shared with everyone</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          {onPreview !== undefined ? (
            <button
              type="button"
              onClick={() => onPreview(buildDefinition())}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition hover:bg-accent active:scale-[0.96]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Preview
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-1.5 text-sm transition hover:bg-accent active:scale-[0.96]"
            >
              Cancel
            </button>
            {onApply !== undefined ? (
              <button
                type="button"
                onClick={() => {
                  onApply(buildDefinition());
                  onClose();
                }}
                className="rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-accent active:scale-[0.96]"
              >
                Apply
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground transition hover:opacity-90 active:scale-[0.96]"
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
