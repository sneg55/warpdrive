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

// Compile the inline builder's raw rows into a deal FilterDefinition, or null for a no-op filter.
// Defense in depth against a malformed row (the read path re-validates via `filterDefinition`):
// drops rows with a blank value or a field/op pairing outside the schema allow-list. Values stay
// strings (the deal read path binds them as parameters, and Zod's value union accepts strings).
// A valueless op (isEmpty/isNotEmpty) is complete with no value, so it is emitted without one.
export function dealRowsToDefinition(
  rows: readonly RawCondition[],
  combinator: "and" | "or",
): FilterDefinition | null {
  const conditions = rows.flatMap((r) => {
    if (!isAstField(r.field)) return [];
    if (!OPS_BY_FIELD[r.field].includes(r.op)) return [];
    // op validated against the field's allow-list above; narrow to the AST enum for the definition.
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

// The inverse: a saved definition reopened in the builder, one editable row per condition.
export function definitionToRows(definition: FilterDefinition): ConditionRow[] {
  return definition.conditions.map((c) => ({
    id: crypto.randomUUID(),
    field: c.field,
    op: c.op,
    value: rowValueOf(c.value),
  }));
}

// The first row whose typed value cannot be what its field expects, as a message to show under the
// builder. Checked as the user types so a doomed save never reaches the server.
export function conditionRowIssue(
  rows: readonly RawCondition[],
  fields: readonly ConditionFieldOption[],
): string | null {
  for (const r of rows) {
    const value = completeRowValue(r.value);
    // A valueless op ignores whatever sits in the value, and a picked list is never free text,
    // so neither can carry the malformed number or date this checks for.
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
