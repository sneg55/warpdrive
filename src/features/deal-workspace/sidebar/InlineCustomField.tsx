"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { InlineCustomFieldEditor } from "@/features/custom-fields/InlineCustomFieldEditor";
import type { InlineSaveResult } from "@/features/inline-edit/useInlineEditField";
import type { CustomFieldDef } from "@/types/customFields";
import type { CustomFieldsSave } from "./customFieldsSave";

export function InlineCustomField({
  onSave,
  def,
  value,
  currency,
}: {
  onSave: CustomFieldsSave;
  def: CustomFieldDef;
  value: unknown;
  currency: string;
}): React.ReactNode {
  const router = useRouter();

  async function save(draft: unknown): Promise<InlineSaveResult> {
    const r = await onSave({ [def.key]: draft });
    router.refresh();
    return r;
  }

  return <InlineCustomFieldEditor def={def} value={value} currency={currency} onSave={save} />;
}
