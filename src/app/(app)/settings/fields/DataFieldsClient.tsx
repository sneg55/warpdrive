"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Select } from "@/components/ui/Select";
import {
  CUSTOM_FIELD_TARGETS,
  CUSTOM_FIELD_TYPES,
  type CustomFieldTarget,
  type CustomFieldType,
} from "@/constants/customFieldTypes";
import { FIELD_INPUT } from "@/constants/formStyles";
import { STRINGS } from "@/constants/strings";
import { createDefAction } from "@/features/custom-fields/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { SettingsHeading } from "../SettingsHeading";
import { BuiltinFieldRow } from "./BuiltinFieldRow";
import { FieldList } from "./FieldList";
import { DATA_FIELDS_STRINGS } from "./strings";
import type { BuiltinRow, FieldRow } from "./types";

const S = STRINGS.settings;
const TARGET_LABEL: Record<CustomFieldTarget, string> = {
  deal: S.entityDeal,
  person: S.entityPerson,
  organization: S.entityOrganization,
  activity: S.entityActivity,
};
const TARGET_OPTIONS = CUSTOM_FIELD_TARGETS.map((fieldTarget) => ({
  value: fieldTarget,
  label: TARGET_LABEL[fieldTarget],
}));
const FIELD_TYPE_OPTIONS = CUSTOM_FIELD_TYPES.map((fieldType) => ({
  value: fieldType,
  label: fieldType,
}));
const OPTION_TYPES = new Set<CustomFieldType>(["single_option", "multi_option"]);

// Parses the comma-separated options input into the {id,label} option shape createDef expects.
function parseOptions(raw: string): { id: string; label: string }[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((label) => ({ id: crypto.randomUUID(), label }));
}

export function DataFieldsClient({
  byTarget,
  builtinByTarget = {},
  initialTarget = "deal",
}: {
  byTarget: Record<string, FieldRow[]>;
  builtinByTarget?: Record<string, BuiltinRow[]>;
  initialTarget?: CustomFieldTarget;
}): React.ReactNode {
  const router = useRouter();
  const [target, setTarget] = useState<CustomFieldTarget>(initialTarget);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = byTarget[target] ?? [];
  const builtinRows = builtinByTarget[target] ?? [];

  async function add(): Promise<void> {
    setError(null);
    const trimmed = name.trim();
    if (trimmed === "") return;
    const options = OPTION_TYPES.has(type) ? parseOptions(optionsRaw) : undefined;
    // An option-typed field with no options is unusable; block it before the action.
    if (options !== undefined && options.length === 0) {
      setError(S.fieldOptionsRequired);
      return;
    }
    const r = await createDefAction(
      { targetEntity: target, type, name: trimmed, options },
      readCsrfToken(),
    );
    if (r.ok) {
      setName("");
      setOptionsRaw("");
      router.refresh();
    } else {
      setError(S.addFieldFailed);
    }
  }

  return (
    <section className="max-w-2xl space-y-4">
      <SettingsHeading title={S.dataFields} description={DATA_FIELDS_STRINGS.description} />

      <div className="block">
        <span className="mb-1 block text-sm font-medium">{S.entity}</span>
        <Select
          ariaLabel={S.entity}
          value={target}
          onChange={(value) => setTarget(value as CustomFieldTarget)}
          options={TARGET_OPTIONS}
        />
      </div>

      {builtinRows.length > 0 && (
        <div className="space-y-1">
          <span className="block text-sm font-medium">{S.builtinFields}</span>
          <ul className="divide-y rounded-md border">
            {builtinRows.map((row) => (
              <BuiltinFieldRow key={row.key} entity={target} row={row} />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{S.builtinHideNote}</p>
        </div>
      )}

      <FieldList key={target} rows={rows} />

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-sm font-medium">{S.fieldName}</span>
            <input
              aria-label={S.fieldName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD_INPUT}
            />
          </label>
          <div className="block">
            <span className="mb-1 block text-sm font-medium">{S.fieldType}</span>
            <Select
              ariaLabel={S.fieldType}
              value={type}
              onChange={(value) => setType(value as CustomFieldType)}
              options={FIELD_TYPE_OPTIONS}
            />
          </div>
        </div>
        {OPTION_TYPES.has(type) && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{S.fieldOptions}</span>
            <input
              aria-label={S.fieldOptions}
              value={optionsRaw}
              onChange={(e) => setOptionsRaw(e.target.value)}
              placeholder={S.fieldOptionsHelp}
              className={FIELD_INPUT}
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => void add()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-transform hover:opacity-90 active:scale-[0.96]"
        >
          {S.addField}
        </button>
        {error !== null && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
