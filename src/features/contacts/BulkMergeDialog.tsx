"use client";
import type React from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, type SelectOption } from "@/components/ui/Select";
import { readCsrfToken } from "@/utils/csrfCookie";
import { mergeOrgsAction, mergePersonsAction } from "./actions";

type Record = { id: string; name: string };

export interface BulkMergeDialogProps {
  kind: "org" | "person";
  // Exactly the two records selected in the list. The survivor is picked between them; the other is
  // merged away. Only the survivor's own name is trusted server-side (fieldChoices is empty).
  records: [Record, Record];
  // Receives the survivor id (the list should clear its selection and refresh).
  onMerged: (survivorId: string) => void;
  onClose: () => void;
}

// List-level merge for a preselected pair of person/organization records (Pipedrive merges pairs).
// Unlike the detail-page MergeDialog (one `current` record + candidate lookup), both records are
// already chosen, so this only asks which one survives, then reuses the same merge actions.
export function BulkMergeDialog({
  kind,
  records,
  onMerged,
  onClose,
}: BulkMergeDialogProps): React.ReactNode {
  const [first, second] = records;
  const [survivorId, setSurvivorId] = useState<string>(first.id);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const survivorOptions: SelectOption[] = records.map((r) => ({ value: r.id, label: r.name }));

  async function confirm(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const mergedId = survivorId === first.id ? second.id : first.id;
      const args = { survivorId, mergedId, fieldChoices: {} };
      const csrf = readCsrfToken();
      const result =
        kind === "org" ? await mergeOrgsAction(args, csrf) : await mergePersonsAction(args, csrf);
      if (!result.ok) {
        setError(`Could not merge (${result.error.id})`);
        return;
      }
      onMerged(survivorId);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Merge duplicates</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose which record to keep. The other is merged into it and removed.
          </p>
          <div className="space-y-1">
            <span className="block text-sm font-medium">Survivor</span>
            <Select
              ariaLabel="Survivor"
              value={survivorId}
              onChange={setSurvivorId}
              options={survivorOptions}
            />
          </div>
          {error !== null && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-1.5 text-sm transition-[background-color,scale] duration-150 ease-out hover:bg-accent active:scale-[0.96] motion-reduce:transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void confirm()}
              className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground transition-[opacity,scale] duration-150 ease-out hover:opacity-90 disabled:opacity-50 active:not-disabled:scale-[0.96] motion-reduce:transition-opacity"
            >
              Merge
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
