import type { ConditionFieldOption, RawCondition } from "@/components/filters/ConditionRows";
import { completeRowValue, type RowValue } from "@/components/filters/rowValue";
import { DATE_PRESET_LABELS, isDatePreset } from "@/constants/dateFilterPresets";
import { VALUELESS_OPS } from "@/constants/filterOps";
import { OP_LABELS } from "./dealFilterCatalog";

function optionLabel(def: ConditionFieldOption | undefined, value: string): string {
  if (def?.input.kind === "date" && isDatePreset(value)) return DATE_PRESET_LABELS[value];
  if (def?.input.kind !== "select" && def?.input.kind !== "multiselect") return value;
  return def.input.options.find((o) => o.value === value)?.label ?? value;
}

function valueLabel(def: ConditionFieldOption | undefined, value: RowValue): string {
  if (!Array.isArray(value)) return optionLabel(def, value);
  return value.map((v) => optionLabel(def, v)).join(" or ");
}

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
