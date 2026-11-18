"use client";
import { Eye } from "lucide-react";
import type React from "react";

const BTN =
  "rounded-md border px-3 py-1.5 text-sm transition-[background-color,scale] duration-150 ease-out hover:bg-accent active:scale-[0.96] disabled:opacity-50 motion-reduce:transition-colors";

interface CreateFilterModalFooterProps {
  disabled: boolean;
  onPreview?: () => void;
  onCancel: () => void;
  onApply?: () => void;
  onSave: () => void;
  saveLabel: string;
}

export function CreateFilterModalFooter({
  disabled,
  onPreview,
  onCancel,
  onApply,
  onSave,
  saveLabel,
}: CreateFilterModalFooterProps): React.ReactNode {
  return (
    <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
      {onPreview !== undefined ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onPreview}
          className={`inline-flex items-center gap-1.5 ${BTN}`}
        >
          <Eye aria-hidden="true" className="h-4 w-4" />
          Preview
        </button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
        {onApply !== undefined ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onApply}
            className={`font-medium ${BTN}`}
          >
            Apply
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={onSave}
          className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground transition-[opacity,scale] duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:opacity-50 motion-reduce:transition-opacity"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
