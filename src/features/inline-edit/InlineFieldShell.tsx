"use client";
import { Pencil } from "lucide-react";
import type React from "react";

interface InlineFieldShellProps {
  // Human label of the field; the pencil's accessible name is "Edit <label>".
  label: string;
  editing: boolean;
  onStartEdit: () => void;
  // View-state content. Pass null/undefined (with emptyPrompt) for a value-less field.
  value?: React.ReactNode;
  // Blue prompt shown when the field is empty; clicking it opens the editor directly.
  emptyPrompt?: string;
  // The editor, rendered in place of the value while editing.
  children?: React.ReactNode;
}

// Pipedrive's sidebar-field view mechanism, matched to the live capture (see
// docs/superpowers/specs/2026-07-08-pd-inline-edit-mechanism.md):
// - the value is plain selectable text (cursor:text), never a click target;
// - hovering the row paints PD's gray (--color-field-hover, 4px radius) and reveals a
//   bordered pencil icon button at the right edge (visibility toggle, no animation);
// - ONLY the pencil enters edit mode;
// - empty fields render a link-blue prompt whose click opens the editor directly;
// - while editing, the editor replaces the value in the same row (no popover).
export function InlineFieldShell({
  label,
  editing,
  onStartEdit,
  value,
  emptyPrompt,
  children,
}: InlineFieldShellProps): React.ReactNode {
  if (editing) return <div>{children}</div>;

  const empty = value === null || value === undefined;
  if (empty && emptyPrompt !== undefined) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-left text-sm text-link hover:bg-field-hover"
      >
        {emptyPrompt}
      </button>
    );
  }

  // Negative margins cancel the hover-box padding so the row keeps PD's 32px pitch: the
  // gray hover background bleeds past the content without adding layout height.
  return (
    <div className="group -mx-1 -my-1 relative flex min-w-0 items-center rounded px-1 py-1 pr-8 hover:bg-field-hover">
      <span className="min-w-0 cursor-text select-text break-words text-left text-sm">{value}</span>
      <button
        type="button"
        aria-label={`Edit ${label}`}
        onClick={onStartEdit}
        // opacity (not visibility) so the button stays in the tab order and the
        // accessibility tree; focus-visible reveals it for keyboard users.
        className="absolute top-1/2 right-1 flex h-6 w-[26px] -translate-y-1/2 items-center justify-center rounded border border-field-border bg-card opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
