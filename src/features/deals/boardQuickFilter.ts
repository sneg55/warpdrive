import { parseDealValue } from "@/lib/parseDealValue";

export const FILTER_FIELD_NAMES = ["title", "orgName", "value", "ownerId"] as const;
export const FILTER_OPERATOR_NAMES = ["contains", "eq", "gt", "lt"] as const;

export type FilterField = (typeof FILTER_FIELD_NAMES)[number];
export type FilterOperator = (typeof FILTER_OPERATOR_NAMES)[number];
export interface Condition {
  field: FilterField;
  operator: FilterOperator;
  value: string;
}

export const TEXT_FILTER_FIELDS: readonly FilterField[] = ["title", "orgName"];

export function operatorsForField(field: FilterField): FilterOperator[] {
  if (field === "value") return ["gt", "lt", "eq"];
  if (field === "ownerId") return ["eq"];
  return ["contains", "eq"];
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
  const n = parseDealValue(raw) ?? 0;
  const target = parseDealValue(cond.value);
  if (target === null) return false;
  return cond.operator === "gt" ? n > target : n < target;
}
