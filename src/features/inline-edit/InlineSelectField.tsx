"use client";
import type React from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { InlineEditFooter } from "./InlineEditFooter";
import { InlineFieldShell } from "./InlineFieldShell";
import { saveErrorMessage } from "./saveError";
import type { InlineSaveFn } from "./useInlineEditField";
import { useInlineEditField } from "./useInlineEditField";

interface InlineSelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onSave: InlineSaveFn<string>;
  placeholder?: string;
  // Custom view-mode rendering for the current value (e.g. an OwnerBadge with avatar), in place of
  // the plain option label. Falls back to the option's label when omitted.
  renderValue?: (value: string) => React.ReactNode;
}

const DEFAULT_PLACEHOLDER = "+ Add";

// PD-mechanism select field. Verified live (source-channel field): PD selects do NOT autosave
// on pick; the option lands in the editor's draft and the dirty-gated Save footer commits it,
// identical to text fields. Only Cancel/Save close the editor.
export function InlineSelectField({
  label,
  value,
  options,
  onSave,
  placeholder = DEFAULT_PLACEHOLDER,
  renderValue,
}: InlineSelectFieldProps): React.ReactNode {
  const f = useInlineEditField(value);
  const dirty = f.draft !== value;
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const editor = f.editing ? (
    <div>
      <Select ariaLabel={label} value={f.draft} options={options} onChange={f.setDraft} />
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
        value={
          selectedLabel === ""
            ? null
            : renderValue !== undefined
              ? renderValue(value)
              : selectedLabel
        }
        emptyPrompt={placeholder}
      >
        {editor}
      </InlineFieldShell>
    </div>
  );
}
