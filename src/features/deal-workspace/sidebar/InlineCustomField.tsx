"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import {
  CustomFieldDetail,
  CustomFieldFormControl,
  isCustomFieldValueEmpty,
} from "@/features/custom-fields/render";
import { updateDealAction } from "@/features/deals/updateAction";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { InlineFieldShell } from "@/features/inline-edit/InlineFieldShell";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import type { InlineSaveResult } from "@/features/inline-edit/useInlineEditField";
import { useInlineEditField } from "@/features/inline-edit/useInlineEditField";
import type { CustomFieldDef } from "@/types/customFields";
import { err, ok } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";

// Inline editor for one deal custom field (Details section). Display is the read-only
// CustomFieldDetail; the hover pencil swaps in the shared per-type CustomFieldFormControl with a
// Cancel/Save footer. Saves the single key through updateDealAction's partial customFields merge
// under the deal's CAS precondition, refreshing on both branches so a stale CAS advances next
// render. Editing mirrors the text/select field mechanism used elsewhere in the sidebar.
export function InlineCustomField({
  dealId,
  expectedUpdatedAt,
  def,
  value,
  currency,
}: {
  dealId: string;
  expectedUpdatedAt: string;
  def: CustomFieldDef;
  value: unknown;
  currency: string;
}): React.ReactNode {
  const router = useRouter();
  const f = useInlineEditField<unknown>(value);
  const dirty = JSON.stringify(f.draft ?? null) !== JSON.stringify(value ?? null);

  async function onSave(draft: unknown): Promise<InlineSaveResult> {
    const r = await updateDealAction(
      { dealId, expectedUpdatedAt, customFields: { [def.key]: draft } },
      readCsrfToken(),
    );
    router.refresh();
    return r.ok ? ok(r.deal) : err(r.error.id);
  }

  const editor = f.editing ? (
    <div className="flex flex-col gap-1.5">
      <CustomFieldFormControl def={def} value={f.draft} onChange={(v) => f.setDraft(v)} />
      {f.error !== null ? (
        <span role="alert" className="text-destructive text-xs">
          {saveErrorMessage(f.error)}
        </span>
      ) : null}
      <InlineEditFooter
        onCancel={f.cancel}
        onSave={() => f.commit(onSave)}
        saveDisabled={!dirty}
        pending={f.pending}
      />
    </div>
  ) : null;

  return (
    <InlineFieldShell
      label={def.name}
      editing={f.editing}
      onStartEdit={f.start}
      value={
        isCustomFieldValueEmpty(value) ? null : (
          <CustomFieldDetail def={def} value={value} currency={currency} />
        )
      }
      emptyPrompt="+ Add"
    >
      {editor}
    </InlineFieldShell>
  );
}
