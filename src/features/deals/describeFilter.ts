import type { ConditionFieldOption, RawCondition } from "@/components/filters/ConditionRows";
import { completeRowValue, type RowValue } from "@/components/filters/rowValue";
import { VALUELESS_OPS } from "@/constants/filterOps";
import { OP_LABELS } from "./dealFilterCatalog";

function optionLabel(def: ConditionFieldOption | undefined, value: string): string {
  if (def?.input.kind !== "select" && def?.input.kind !== "multiselect") return value;
  return def.input.options.find((o) => o.value === value)?.label ?? value;
}

// Human-readable value: a dropdown field resolves its stored id to the option's label (owner name,
// stage name, label name); free-text/number/date fields read as typed. A multi-value condition
// means "any of these", so its values read as alternatives.
function valueLabel(def: ConditionFieldOption | undefined, value: RowValue): string {
  if (!Array.isArray(value)) return optionLabel(def, value);
  return value.map((v) => optionLabel(def, v)).join(" or ");
}

// A default filter name derived from the conditions, e.g. "Owner is Ada King and Value greater
// than 60000". Skips incomplete rows; empty when nothing is set yet. A valueless op reads as
// "Value is empty", with nothing after the operator.
export function describeRows(
  rows: readonly RawCondition[],
  fields: readonly ConditionFieldOption[],
  combinator: "and" | "or" = "and",
): string {
  return rows
    .filter((r) => VALUELESS_OPS.has(r.op) || completeRowValue(r.value) !== null)
    .map((r) => {
      const def = fields.find((f) => f.field === r.field);
      const prefix = `${def?.label ?? r.field} ${OP_LABELS[r.op] ?? r.op}`;
      return VALUELESS_OPS.has(r.op) ? prefix : `${prefix} ${valueLabel(def, r.value)}`;
    })
    .join(combinator === "or" ? " or " : " and ");
}
