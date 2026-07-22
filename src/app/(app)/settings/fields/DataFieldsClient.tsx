"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  CUSTOM_FIELD_TARGETS,
  CUSTOM_FIELD_TYPES,
  type CustomFieldTarget,
  type CustomFieldType,
} from "@/constants/customFieldTypes";
import { STRINGS } from "@/constants/strings";
import { createDefAction } from "@/features/custom-fields/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import { SettingsHeading } from "../SettingsHeading";
import { SettingsPage } from "../SettingsSurface";
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
  label: fieldType.replaceAll("_", " "),
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
    <SettingsPage>
      <SettingsHeading title={S.dataFields} description={DATA_FIELDS_STRINGS.description} />

      <div className="block">
        <span className="mb-1 block text-sm font-medium">{S.entity}</span>
        <Select
          ariaLabel={S.entity}
          value={target}
          onChange={(value) => setTarget(value as CustomFieldTarget)}
          options={TARGET_OPTIONS}
          triggerContent={TARGET_LABEL[target]}
        />
      </div>

      {builtinRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{S.builtinFields}</h2>
          <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-sm">
            {builtinRows.map((row) => (
              <BuiltinFieldRow key={row.key} entity={target} row={row} />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{S.builtinHideNote}</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{S.customFields}</h2>
        <FieldList
          key={target}
          rows={rows}
          footer={
            <li className="space-y-2 bg-muted/10 px-3 py-3">
              <div className="flex flex-wrap items-end gap-2">
                <label htmlFor="new-field-name" className="min-w-48 flex-1">
                  <span className="mb-1 block text-sm font-medium">{S.fieldName}</span>
                  <Input
                    id="new-field-name"
                    aria-label={S.fieldName}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="w-36 shrink-0">
                  <span className="mb-1 block text-sm font-medium">{S.fieldType}</span>
                  <Select
                    ariaLabel={S.fieldType}
                    value={type}
                    onChange={(value) => setType(value as CustomFieldType)}
                    options={FIELD_TYPE_OPTIONS}
                    triggerContent={type.replaceAll("_", " ")}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="px-3"
                  disabled={name.trim() === ""}
                  onClick={() => void add()}
                >
                  {S.addField}
                </Button>
              </div>
              {OPTION_TYPES.has(type) && (
                <label htmlFor="new-field-options" className="block">
                  <span className="mb-1 block text-sm font-medium">{S.fieldOptions}</span>
                  <Input
                    id="new-field-options"
                    aria-label={S.fieldOptions}
                    value={optionsRaw}
                    onChange={(e) => setOptionsRaw(e.target.value)}
                    placeholder={S.fieldOptionsHelp}
                  />
                </label>
              )}
              {error !== null && <p className="text-sm text-red-600">{error}</p>}
            </li>
          }
        />
      </section>
    </SettingsPage>
  );
}
