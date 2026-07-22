"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { patchContactCustomFieldAction } from "@/features/contacts/actions";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import type { CustomFieldDef } from "@/types/customFields";
import { err, ok } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";
import { InlineCustomFieldEditor } from "./InlineCustomFieldEditor";
import { isCustomFieldValueEmpty } from "./render";

export type CustomFieldContact =
  | { kind: "person"; id: string; customFields: Record<string, unknown> }
  | { kind: "organization"; id: string; customFields: Record<string, unknown> };

// Contact custom fields rendered as ordinary sidebar rows, not a second card. Each save is a
// server-side per-key patch so archived values and overlapping edits are preserved.
export function ContactCustomFieldRows({
  contact,
  defs,
  currency,
}: {
  contact: CustomFieldContact;
  defs: CustomFieldDef[];
  currency: string;
}): React.ReactNode {
  const router = useRouter();

  async function save(key: string, value: unknown) {
    const result = await patchContactCustomFieldAction(
      { entity: contact.kind, id: contact.id, key, value },
      readCsrfToken(),
    );
    if (!result.ok) return err(result.error.id);
    router.refresh();
    return ok(result.value);
  }

  return defs.map((def) => {
    const value = contact.customFields[def.key];
    return (
      <FieldRow key={def.id} label={def.name} empty={isCustomFieldValueEmpty(value)}>
        <InlineCustomFieldEditor
          def={def}
          value={value}
          currency={currency}
          onSave={(draft) => save(def.key, draft)}
        />
      </FieldRow>
    );
  });
}
