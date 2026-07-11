// Quick-filter condition primitives shared by the toolbar chips (boardConditions) and the
// list view. Extracted from the retired browser-local saved-filter module so it survives that
// deletion. Pure and storage-agnostic: evaluates a single condition against a loaded card.
import { parseDealValue } from "@/lib/parseDealValue";

// Field/operator vocabularies as plain const arrays. This module rides into the board client
// bundle, so it deliberately avoids zod (a single schema here would pull ~62 KB gzipped). The
// server re-validates any persisted filter at its own boundary.
export const FILTER_FIELD_NAMES = ["title", "orgName", "value", "ownerId"] as const;
export const FILTER_OPERATOR_NAMES = ["contains", "eq", "gt", "lt"] as const;

export type FilterField = (typeof FILTER_FIELD_NAMES)[number];
export type FilterOperator = (typeof FILTER_OPERATOR_NAMES)[number];
export interface Condition {
  field: FilterField;
  operator: FilterOperator;
  value: string;
}

// Text fields filter by substring (contains); the numeric value field by comparison. Used to keep
// the field and operator in a valid pairing so switching field cannot leave e.g. (title, ">"),
// which would coerce the title to NaN and silently match nothing.
export const TEXT_FILTER_FIELDS: readonly FilterField[] = ["title", "orgName"];

// The operators that make sense for a field, so the UI can constrain the picker and reset the
// operator when the field changes (preventing the invalid (text, numeric-op) pairing).
export function operatorsForField(field: FilterField): FilterOperator[] {
  if (field === "value") return ["gt", "lt", "eq"];
  if (field === "ownerId") return ["eq"];
  return ["contains", "eq"]; // title, orgName
}

export function defaultOperatorForField(field: FilterField): FilterOperator {
  return operatorsForField(field)[0] ?? "contains";
}

export interface FilterableCard {
  title: string;
  value: string | null;
  ownerId: string;
  orgName?: string | null;
}

function fieldValue(card: FilterableCard, field: FilterField): string | null {
  if (field === "title") return card.title;
  if (field === "orgName") return card.orgName ?? null;
  if (field === "value") return card.value;
  return card.ownerId;
}

export function matchesCondition(card: FilterableCard, cond: Condition): boolean {
  const raw = fieldValue(card, cond.field);
  if (cond.operator === "contains") {
    return (raw ?? "").toLowerCase().includes(cond.value.toLowerCase());
  }
  if (cond.operator === "eq") {
    return (raw ?? "") === cond.value;
  }
  // Numeric comparisons: treat a missing value as 0; a non-numeric filter target never matches.
  const n = parseDealValue(raw) ?? 0;
  const target = parseDealValue(cond.value);
  if (target === null) return false;
  return cond.operator === "gt" ? n > target : n < target;
}
