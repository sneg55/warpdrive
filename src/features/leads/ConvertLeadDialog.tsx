"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ERROR_IDS } from "@/constants/errorIds";
import {
  addFormCustomFieldDefs,
  CustomFieldCreateFields,
  customFieldCreatePayload,
  firstMissingImportantField,
} from "@/features/custom-fields/CustomFieldCreateFields";
import { EntityCreateDialogShell } from "@/features/entity-create/EntityCreateDialogShell";
import type { CustomFieldDef } from "@/types/customFields";
import { type ConvertOutcome, convertFailure } from "./convertOutcome";

export function ConvertLeadDialog({
  defs,
  initialValues = {},
  onClose,
  onConvert,
  onLateFailure,
}: {
  defs: CustomFieldDef[];
  initialValues?: Record<string, unknown>;
  onClose: () => void;
  onConvert: (customFields: Record<string, unknown>) => Promise<ConvertOutcome>;
  onLateFailure: (outcome: ConvertOutcome) => void;
}): React.ReactNode {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...initialValues }));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const dismissed = useRef(false);

  useEffect(() => {
    dismissed.current = false;
    return () => {
      dismissed.current = true;
    };
  }, []);

  function dismiss(): void {
    dismissed.current = true;
    onClose();
  }

  function fail(outcome: ConvertOutcome): void {
    if (dismissed.current) onLateFailure(outcome);
    else if (!outcome.ok) setError(outcome.message);
  }

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
      const outcome = await onConvert(payload);
      if (outcome.ok) onClose();
      else fail(outcome);
    } catch (e) {
      console.warn("convert handoff threw", e);
      fail(convertFailure(ERROR_IDS.UI_ACTION_UNCONFIRMED));
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
      onClose={dismiss}
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
