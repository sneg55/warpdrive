import { completeRowValue, type RowValue, singleRowValue } from "@/components/filters/rowValue";
import { FILTER_OP_LABELS, VALUELESS_OPS } from "@/constants/filterOps";
import {
  CONTACT_ARRAY_FIELDS,
  type ContactFilterConfig,
  type ContactFilterDefinition,
  type ContactFilterOp,
} from "./contactFilterConfig";

// One in-progress builder row (field + op + raw value). Kept as strings for the form; the value is
// coerced to a number for numeric fields when the definition is built. A label row carries the list
// the multi-select produced, which is how one condition means "is any of".
export interface BuilderRow {
  field: string;
  op: ContactFilterOp;
  value: RowValue;
}

// Human labels for each operator, shown in the op dropdown. Shared so People, Orgs, Leads, and
// Deals all read the same wording for the same operator.
export const OP_LABELS: Record<ContactFilterOp, string> = FILTER_OP_LABELS;

// Human field labels for the field dropdown, per entity (keys match the backend config fields).
export const PERSON_FILTER_LABELS: Record<string, string> = {
  name: "Name",
  primaryEmail: "Email",
  ownerId: "Owner",
  labels: "Label",
};
export const ORG_FILTER_LABELS: Record<string, string> = {
  name: "Name",
  industry: "Industry",
  employeeCount: "Employees",
  ownerId: "Owner",
  labels: "Label",
};

// Field value input kind, derived from the backend config (no separate source of truth). "label"
// gets a picker: the stored value is a label key, which a user cannot be expected to type.
export type FieldKind = "text" | "number" | "owner" | "label";
export function fieldKind(config: ContactFilterConfig, field: string): FieldKind {
  if (field === "ownerId") return "owner";
  if (CONTACT_ARRAY_FIELDS.includes(field)) return "label";
  if (config.numericFields.includes(field)) return "number";
  return "text";
}

// Compile the in-progress rows into a validated ContactFilterDefinition, or null for a no-op filter.
// Drops rows with a blank value or a field/op pairing outside the allow-list (defense in depth: the
// server re-validates, but a bad row should never be sent). Numeric fields coerce to a number.
// A valueless op (isEmpty / isNotEmpty) is a complete row with a blank value box, so it survives:
// dropping it would make an "is empty" filter look exactly like a filter that matched everything.
export function rowsToDefinition(
  combinator: "and" | "or",
  rows: readonly BuilderRow[],
  config: ContactFilterConfig,
): ContactFilterDefinition | null {
  const conditions = rows.flatMap((r) => {
    if (!config.fields.includes(r.field)) return [];
    if (!(config.opsByField[r.field] ?? []).includes(r.op)) return [];
    if (VALUELESS_OPS.has(r.op)) return [{ field: r.field, op: r.op }];
    const picked = completeRowValue(r.value);
    if (picked === null) return [];
    if (!config.numericFields.includes(r.field))
      return [{ field: r.field, op: r.op, value: picked }];
    const numeric = Number(singleRowValue(picked));
    if (!Number.isFinite(numeric)) return [];
    return [{ field: r.field, op: r.op, value: numeric }];
  });
  return conditions.length === 0 ? null : { combinator, conditions };
}
