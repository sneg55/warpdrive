"use client";
import type React from "react";
import { Button } from "@/components/ui/Button";

interface InlineEditFooterProps {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  pending?: boolean;
}

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
        className="h-6 rounded bg-save px-2 text-xs text-white"
      >
        Save
      </Button>
    </div>
  );
}
