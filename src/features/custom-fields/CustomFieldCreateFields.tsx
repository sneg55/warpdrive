"use client";

import type React from "react";
import type { CustomFieldDef } from "@/types/customFields";
import { CustomFieldFormControl, isCustomFieldValueEmpty } from "./render";

export type CustomFieldValues = Record<string, unknown>;

// Important fields are required during creation and therefore always belong on the add form.
// Show-in-add-form fields are visible but optional. Keeping the rule here gives every create
// surface the same behavior.
export function addFormCustomFieldDefs(defs: CustomFieldDef[]): CustomFieldDef[] {
  return defs.filter(
    (def) => def.archivedAt === null && (def.isRequired || def.isImportant || def.showInAddForm),
  );
}

function hasObjectValue(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).some((entry) => {
    if (typeof entry === "string") return entry.trim() !== "";
    return entry !== null && entry !== undefined;
  });
}

export function isCreateCustomFieldEmpty(def: CustomFieldDef, value: unknown): boolean {
  if (def.type === "address") return !hasObjectValue(value);
  if (def.type === "date_range" || def.type === "time_range") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return true;
    const range = value as { start?: unknown; end?: unknown };
    return range.start === "" || range.start == null || range.end === "" || range.end == null;
  }
  if (typeof value === "string") return value.trim() === "";
  return isCustomFieldValueEmpty(value);
}

export function firstMissingImportantField(
  defs: CustomFieldDef[],
  values: CustomFieldValues,
): CustomFieldDef | null {
  return (
    addFormCustomFieldDefs(defs).find(
      (def) =>
        (def.isImportant || def.isRequired) && isCreateCustomFieldEmpty(def, values[def.key]),
    ) ?? null
  );
}

// Submit only fields that belong to this create form and contain a value. This prevents hidden
// metadata from being posted and avoids asking the type validator to parse optional blank values.
export function customFieldCreatePayload(
  defs: CustomFieldDef[],
  values: CustomFieldValues,
): CustomFieldValues {
  const payload: CustomFieldValues = {};
  for (const def of addFormCustomFieldDefs(defs)) {
    const value = values[def.key];
    if (!isCreateCustomFieldEmpty(def, value)) payload[def.key] = value;
  }
  return payload;
}

export function CustomFieldCreateFields({
  defs,
  values,
  onChange,
  title = "Custom fields",
}: {
  defs: CustomFieldDef[];
  values: CustomFieldValues;
  onChange: (key: string, value: unknown) => void;
  title?: string;
}): React.ReactNode {
  const visibleDefs = addFormCustomFieldDefs(defs);
  if (visibleDefs.length === 0) return null;

  return (
    <fieldset className="space-y-3 border-t pt-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      {visibleDefs.map((def) => {
        const required = def.isImportant || def.isRequired;
        return (
          <div key={def.id} className="space-y-1.5">
            <div className="text-sm font-medium">
              {def.name}
              {required ? (
                <>
                  <span aria-hidden="true" className="ml-1 text-destructive">
                    *
                  </span>
                  <span className="sr-only"> (required)</span>
                </>
              ) : null}
            </div>
            <CustomFieldFormControl
              def={def}
              value={values[def.key]}
              onChange={(value) => onChange(def.key, value)}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
