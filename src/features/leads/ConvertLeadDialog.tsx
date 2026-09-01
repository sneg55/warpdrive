"use client";

import type React from "react";
import { useRef, useState } from "react";
import {
  addFormCustomFieldDefs,
  CustomFieldCreateFields,
  customFieldCreatePayload,
  firstMissingImportantField,
} from "@/features/custom-fields/CustomFieldCreateFields";
import { EntityCreateDialogShell } from "@/features/entity-create/EntityCreateDialogShell";
import type { CustomFieldDef } from "@/types/customFields";

export function ConvertLeadDialog({
  defs,
  initialValues = {},
  onClose,
  onConvert,
}: {
  defs: CustomFieldDef[];
  initialValues?: Record<string, unknown>;
  onClose: () => void;
  onConvert: (customFields: Record<string, unknown>) => Promise<boolean>;
}): React.ReactNode {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...initialValues }));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  async function submit(): Promise<void> {
    if (submitting.current) return;
    const missing = firstMissingImportantField(defs, values);
    if (missing !== null) {
      setError(`${missing.name} is required`);
      return;
    }

    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const payload = customFieldCreatePayload(defs, values);
      for (const def of addFormCustomFieldDefs(defs)) {
        if (def.key in initialValues && !(def.key in payload)) payload[def.key] = null;
      }
      const converted = await onConvert(payload);
      if (converted) onClose();
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <EntityCreateDialogShell
      title="Convert to deal"
      error={error}
      pending={pending}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <CustomFieldCreateFields
        defs={defs}
        values={values}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        title="Deal fields"
      />
    </EntityCreateDialogShell>
  );
}
