"use client";
import type React from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { formatMdy } from "@/components/ui/dateFormat";
import { InlineEditFooter } from "./InlineEditFooter";
import { InlineFieldShell } from "./InlineFieldShell";
import { saveErrorMessage } from "./saveError";
import type { InlineSaveFn } from "./useInlineEditField";
import { useInlineEditField } from "./useInlineEditField";

interface InlineDateFieldProps {
  label: string;
  value: string | null;
  onSave: InlineSaveFn<string | null>;
}

// PD-mechanism date field. Verified live (expected close date): picking a day does NOT
// autosave; it lands in the editor's draft (the calendar opens immediately on edit) and the
// dirty-gated Save footer commits it. Only Cancel/Save close the editor.
export function InlineDateField({ label, value, onSave }: InlineDateFieldProps): React.ReactNode {
  const f = useInlineEditField(value);
  const dirty = f.draft !== value;

  const editor = f.editing ? (
    <div>
      <DatePicker
        ariaLabel={label}
        value={f.draft}
        onChange={f.setDraft}
        placeholder="Set date"
        defaultOpen
        triggerClassName="flex h-8 w-full items-center rounded border border-field-border bg-card px-2 text-left text-sm"
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
        value={value !== null ? formatMdy(value) : null}
        emptyPrompt="Set date"
      >
        {editor}
      </InlineFieldShell>
    </div>
  );
}
