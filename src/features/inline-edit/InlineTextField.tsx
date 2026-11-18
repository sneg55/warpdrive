"use client";
import type React from "react";
import { InlineEditFooter } from "./InlineEditFooter";
import { InlineFieldShell } from "./InlineFieldShell";
import { saveErrorMessage } from "./saveError";
import type { InlineSaveFn } from "./useInlineEditField";
import { useInlineEditField } from "./useInlineEditField";

interface InlineTextFieldProps {
  label: string;
  value: string;
  onSave: InlineSaveFn<string>;
  placeholder?: string;
}

const DEFAULT_PLACEHOLDER = "+ Add";

export function InlineTextField({
  label,
  value,
  onSave,
  placeholder = DEFAULT_PLACEHOLDER,
}: InlineTextFieldProps): React.ReactNode {
  const f = useInlineEditField(value);
  const dirty = f.draft !== value;

  const editor = f.editing ? (
    <div>
      <input
        aria-label={label}
        // biome-ignore lint/a11y/noAutofocus: inline edit focuses immediately on activation
        autoFocus
        value={f.draft}
        disabled={f.pending}
        onChange={(e) => f.setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) f.commit(onSave);
        }}
        className="h-8 w-full rounded border border-field-border bg-card px-2 text-sm"
      />
      <InlineEditFooter
        onCancel={f.cancel}
        onSave={() => f.commit(onSave)}
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
        value={value === "" ? null : value}
        emptyPrompt={placeholder}
      >
        {editor}
      </InlineFieldShell>
    </div>
  );
}
