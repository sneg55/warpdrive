import type { RawCondition } from "@/components/filters/ConditionRowsBuilder";
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
export function dealRowsToDefinition(rows: readonly RawCondition[]): FilterDefinition | null {
  const conditions = rows.flatMap((r) => {
    const value = r.value.trim();
    if (value === "") return [];
    if (!isAstField(r.field)) return [];
    if (!OPS_BY_FIELD[r.field].includes(r.op)) return [];
    // op validated against the field's allow-list above; narrow to the AST enum for the definition.
    return [{ field: r.field, op: r.op as AstOp, value }];
  });
  return conditions.length === 0 ? null : { conditions };
}
