import type {
  ContactFilterConfig,
  ContactFilterDefinition,
  ContactFilterOp,
} from "./contactFilterConfig";

// One in-progress builder row (field + op + raw string value). Kept as strings for the form; the
// value is coerced to a number for numeric fields when the definition is built.
export interface BuilderRow {
  field: string;
  op: ContactFilterOp;
  value: string;
}

// Human labels for each operator, shown in the op dropdown.
export const OP_LABELS: Record<ContactFilterOp, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  gt: "greater than",
  lt: "less than",
  gte: "at least",
  lte: "at most",
};

// Human field labels for the field dropdown, per entity (keys match the backend config fields).
export const PERSON_FILTER_LABELS: Record<string, string> = {
  name: "Name",
  primaryEmail: "Email",
  ownerId: "Owner",
};
export const ORG_FILTER_LABELS: Record<string, string> = {
  name: "Name",
  industry: "Industry",
  employeeCount: "Employees",
  ownerId: "Owner",
};

// Field value input kind, derived from the backend config (no separate source of truth).
export type FieldKind = "text" | "number" | "owner";
export function fieldKind(config: ContactFilterConfig, field: string): FieldKind {
  if (field === "ownerId") return "owner";
  if (config.numericFields.includes(field)) return "number";
  return "text";
}

// Compile the in-progress rows into a validated ContactFilterDefinition, or null for a no-op filter.
// Drops rows with a blank value or a field/op pairing outside the allow-list (defense in depth: the
// server re-validates, but a bad row should never be sent). Numeric fields coerce to a number.
export function rowsToDefinition(
  combinator: "and" | "or",
  rows: readonly BuilderRow[],
  config: ContactFilterConfig,
): ContactFilterDefinition | null {
  const conditions = rows.flatMap((r) => {
    const trimmed = r.value.trim();
    if (trimmed === "") return [];
    if (!config.fields.includes(r.field)) return [];
    if (!(config.opsByField[r.field] ?? []).includes(r.op)) return [];
    const value: string | number = config.numericFields.includes(r.field)
      ? Number(trimmed)
      : trimmed;
    if (config.numericFields.includes(r.field) && !Number.isFinite(value)) return [];
    return [{ field: r.field, op: r.op, value }];
  });
  return conditions.length === 0 ? null : { combinator, conditions };
}
