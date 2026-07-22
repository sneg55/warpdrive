"use client";

import type React from "react";
import { InlineEditFooter } from "./InlineEditFooter";
import { InlineFieldShell } from "./InlineFieldShell";
import { saveErrorMessage } from "./saveError";
import type { InlineSaveFn } from "./useInlineEditField";
import { useInlineEditField } from "./useInlineEditField";

interface EditableHeadingProps {
  title: string;
  label: string;
  onCommit: InlineSaveFn<string>;
}

// Page-heading variant of the same Pipedrive inline field used throughout the sidebars: the
// title remains selectable text, row hover reveals the shared bordered pencil, and the editor
// uses the shared Save/Cancel footer. Blank and unchanged values never reach the mutation.
export function EditableHeading({ title, label, onCommit }: EditableHeadingProps): React.ReactNode {
  const f = useInlineEditField(title);
  const trimmedDraft = f.draft.trim();
  const dirty = trimmedDraft !== "" && trimmedDraft !== title;

  function commit(): void {
    if (dirty) f.commit(onCommit, trimmedDraft);
  }

  const editor = f.editing ? (
    <div className="min-w-0">
      <h1 className="min-w-0 text-[25px]">
        <input
          // biome-ignore lint/a11y/noAutofocus: inline edit focuses immediately on activation
          autoFocus
          aria-label={`Edit ${label}`}
          value={f.draft}
          disabled={f.pending}
          onChange={(event) => f.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty) {
              event.preventDefault();
              commit();
            }
          }}
          className="h-10 w-full rounded border border-field-border bg-card px-2 font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </h1>
      <InlineEditFooter
        onCancel={f.cancel}
        onSave={commit}
        saveDisabled={!dirty}
        pending={f.pending}
      />
    </div>
  ) : null;

  return (
    <div className="min-w-0">
      {f.error !== null && !f.editing ? (
        <span className="text-xs text-destructive">{saveErrorMessage(f.error)}</span>
      ) : null}
      <InlineFieldShell
        label={label}
        editing={f.editing}
        onStartEdit={f.start}
        value={title}
        valueElement="h1"
        valueClassName="truncate text-[25px] font-semibold text-foreground"
      >
        {editor}
      </InlineFieldShell>
    </div>
  );
}
