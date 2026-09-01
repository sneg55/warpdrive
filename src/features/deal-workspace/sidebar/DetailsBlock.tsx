"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { STRINGS } from "@/constants/strings";
import { CustomFieldFormControl, isCustomFieldValueEmpty } from "@/features/custom-fields/render";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import type { CustomFieldDef } from "@/types/customFields";
import type { CustomFieldsSave } from "./customFieldsSave";
import { FieldRow } from "./FieldRow";
import { InlineCustomField } from "./InlineCustomField";

interface DetailsBlockProps {
  onSave: CustomFieldsSave;
  customFieldDefs: CustomFieldDef[];
  customFields: Record<string, unknown>;
  currency: string;
  bulkEditing?: boolean;
  onExitBulk?: () => void;
}

export function DetailsBlock({
  onSave,
  customFieldDefs,
  customFields,
  currency,
  bulkEditing = false,
  onExitBulk,
}: DetailsBlockProps): React.ReactNode {
  if (customFieldDefs.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">{STRINGS.dealSidebar.emptyState.details}</p>
    );
  }
  if (bulkEditing) {
    return (
      <DetailsBulkEditor
        onSave={onSave}
        customFieldDefs={customFieldDefs}
        customFields={customFields}
        onExit={onExitBulk ?? (() => {})}
      />
    );
  }
  return (
    <>
      {customFieldDefs.map((def) => {
        const value = customFields[def.key];
        return (
          <FieldRow key={def.id} label={def.name} empty={isCustomFieldValueEmpty(value)}>
            <InlineCustomField onSave={onSave} def={def} value={value} currency={currency} />
          </FieldRow>
        );
      })}
    </>
  );
}

function DetailsBulkEditor({
  onSave,
  customFieldDefs,
  customFields,
  onExit,
}: {
  onSave: CustomFieldsSave;
  customFieldDefs: CustomFieldDef[];
  customFields: Record<string, unknown>;
  onExit: () => void;
}): React.ReactNode {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const d: Record<string, unknown> = {};
    for (const def of customFieldDefs) d[def.key] = customFields[def.key];
    return d;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changedKeys(): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const def of customFieldDefs) {
      const next = draft[def.key];
      if (JSON.stringify(next ?? null) !== JSON.stringify(customFields[def.key] ?? null)) {
        patch[def.key] = next;
      }
    }
    return patch;
  }

  function commit(): void {
    const patch = changedKeys();
    if (Object.keys(patch).length === 0) {
      onExit();
      return;
    }
    setPending(true);
    setError(null);
    onSave(patch)
      .then((r) => {
        setPending(false);
        if (r.ok) {
          router.refresh();
          onExit();
        } else {
          setError(saveErrorMessage(r.error));
        }
      })
      .catch(() => {
        setPending(false);
        setError(saveErrorMessage());
      });
  }

  return (
    <div className="flex flex-col gap-2">
      {customFieldDefs.map((def) => (
        <div key={def.id} className="flex flex-col gap-0.5 text-muted-foreground text-xs">
          <span>{def.name}</span>
          <CustomFieldFormControl
            def={def}
            value={draft[def.key]}
            onChange={(v) => setDraft((prev) => ({ ...prev, [def.key]: v }))}
          />
        </div>
      ))}
      {error !== null ? (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      ) : null}
      <InlineEditFooter onCancel={onExit} onSave={commit} saveDisabled={false} pending={pending} />
    </div>
  );
}
