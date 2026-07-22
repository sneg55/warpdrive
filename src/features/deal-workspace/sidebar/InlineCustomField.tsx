"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { InlineCustomFieldEditor } from "@/features/custom-fields/InlineCustomFieldEditor";
import { updateDealAction } from "@/features/deals/updateAction";
import type { InlineSaveResult } from "@/features/inline-edit/useInlineEditField";
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

  async function onSave(draft: unknown): Promise<InlineSaveResult> {
    const r = await updateDealAction(
      { dealId, expectedUpdatedAt, customFields: { [def.key]: draft } },
      readCsrfToken(),
    );
    router.refresh();
    return r.ok ? ok(r.deal) : err(r.error.id);
  }

  return <InlineCustomFieldEditor def={def} value={value} currency={currency} onSave={onSave} />;
}
