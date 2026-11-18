import type {
  ConditionFieldOption,
  ConditionRow,
  RawCondition,
} from "@/components/filters/ConditionRowsBuilder";
import { completeRowValue, type RowValue } from "@/components/filters/rowValue";
import { isDateConditionValue } from "@/constants/dateFilterPresets";
import { VALUELESS_OPS } from "@/constants/filterOps";
import {
  FILTER_FIELDS,
  type FILTER_OPS,
  OPS_BY_FIELD,
} from "@/features/saved-filters/filterFields";
import type { FilterDefinition } from "@/features/saved-filters/schemas";

type AstField = (typeof FILTER_FIELDS)[number];
type AstOp = (typeof FILTER_OPS)[number];

function isAstField(field: string): field is AstField {
  return (FILTER_FIELDS as readonly string[]).includes(field);
}

export function dealRowsToDefinition(
  rows: readonly RawCondition[],
  combinator: "and" | "or",
): FilterDefinition | null {
  const conditions = rows.flatMap((r) => {
    if (!isAstField(r.field)) return [];
    if (!OPS_BY_FIELD[r.field].includes(r.op)) return [];
    const condition = { field: r.field, op: r.op as AstOp };
    if (VALUELESS_OPS.has(r.op)) return [condition];
    const value = completeRowValue(r.value);
    if (value === null) return [];
    return [{ ...condition, value }];
  });
  return conditions.length === 0 ? null : { combinator, conditions };
}

function rowValueOf(value: string | number | string[] | undefined): RowValue {
  if (value === undefined) return "";
  return Array.isArray(value) ? [...value] : String(value);
}

export function definitionToRows(definition: FilterDefinition): ConditionRow[] {
  return definition.conditions.map((c) => ({
    id: crypto.randomUUID(),
    field: c.field,
    op: c.op,
    value: rowValueOf(c.value),
  }));
}

export function conditionRowIssue(
  rows: readonly RawCondition[],
  fields: readonly ConditionFieldOption[],
): string | null {
  for (const r of rows) {
    const value = completeRowValue(r.value);
    if (value === null || Array.isArray(value) || VALUELESS_OPS.has(r.op)) continue;
    const def = fields.find((f) => f.field === r.field);
    if (def === undefined) continue;
    if (def.input.kind === "number" && Number.isNaN(Number(value))) {
      return `${def.label} needs a number.`;
    }
    if (def.input.kind === "date" && !isDateConditionValue(value)) {
      return `${def.label} needs a date.`;
    }
  }
  return null;
}
