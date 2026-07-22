"use client";
import type React from "react";
import { Button } from "@/components/ui/Button";

interface InlineEditFooterProps {
  onCancel: () => void;
  onSave: () => void;
  // PD dirty-gates Save: disabled (muted green) until the draft differs from the value.
  saveDisabled: boolean;
  pending?: boolean;
}

// Pipedrive's inline-editor ActionFooter, byte-matched to the live capture (see
// docs/superpowers/specs/2026-07-08-pd-inline-edit-mechanism.md): right-aligned under the
// editor with an 8px gap above, 24px-tall 12px/600 buttons, 4px between them; Cancel is a
// bordered white secondary, Save is PD's action green. Only these two controls close the
// editor: PD has no Escape/blur/outside-click dismissal, so this footer is the entire exit.
export function InlineEditFooter({
  onCancel,
  onSave,
  saveDisabled,
  pending = false,
}: InlineEditFooterProps): React.ReactNode {
  const disabled = saveDisabled || pending;
  return (
    <div className="mt-2 flex justify-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onCancel}
        disabled={pending}
        className="h-6 rounded px-2 text-xs"
      >
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={onSave}
        disabled={disabled}
        aria-disabled={disabled}
        className="h-6 rounded bg-save px-2 text-xs text-white disabled:bg-save-muted disabled:opacity-100"
      >
        Save
      </Button>
    </div>
  );
}
