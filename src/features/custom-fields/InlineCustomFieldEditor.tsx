"use client";

import type React from "react";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { InlineFieldShell } from "@/features/inline-edit/InlineFieldShell";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import type { InlineSaveFn } from "@/features/inline-edit/useInlineEditField";
import { useInlineEditField } from "@/features/inline-edit/useInlineEditField";
import type { CustomFieldDef } from "@/types/customFields";
import { CustomFieldDetail, CustomFieldFormControl, isCustomFieldValueEmpty } from "./render";

// Shared custom-field interaction used by deal, person, and organization rows. Persistence stays
// with the owning entity wrapper; this component owns only the common display/edit state machine.
export function InlineCustomFieldEditor({
  def,
  value,
  currency,
  onSave,
}: {
  def: CustomFieldDef;
  value: unknown;
  currency: string;
  onSave: InlineSaveFn<unknown>;
}): React.ReactNode {
  const field = useInlineEditField<unknown>(value);
  const dirty = JSON.stringify(field.draft ?? null) !== JSON.stringify(value ?? null);

  const editor = field.editing ? (
    <div className="flex flex-col gap-1.5">
      <CustomFieldFormControl
        def={def}
        value={field.draft}
        onChange={(next) => field.setDraft(next)}
      />
      {field.error !== null ? (
        <span role="alert" className="text-destructive text-xs">
          {saveErrorMessage(field.error)}
        </span>
      ) : null}
      <InlineEditFooter
        onCancel={field.cancel}
        onSave={() => field.commit(onSave)}
        saveDisabled={!dirty}
        pending={field.pending}
      />
    </div>
  ) : null;

  return (
    <InlineFieldShell
      label={def.name}
      editing={field.editing}
      onStartEdit={field.start}
      value={
        isCustomFieldValueEmpty(value) ? (
          "-"
        ) : (
          <CustomFieldDetail def={def} value={value} currency={currency} />
        )
      }
    >
      {editor}
    </InlineFieldShell>
  );
}
