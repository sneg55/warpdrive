import type { RawCondition } from "@/components/filters/ConditionRowsBuilder";
import { completeRowValue } from "@/components/filters/rowValue";
import { VALUELESS_OPS } from "@/constants/filterOps";
import {
  LEAD_FILTER_FIELDS,
  type LEAD_FILTER_OPS,
  type LeadFilterField,
  OPS_BY_LEAD_FIELD,
} from "../leadFilterFields";
import type { LeadConditionInput } from "../schemas";

type LeadOp = (typeof LEAD_FILTER_OPS)[number];

function isLeadField(field: string): field is LeadFilterField {
  return (LEAD_FILTER_FIELDS as readonly string[]).includes(field);
}

// Compile the inline builder's raw rows into a lead condition definition, or null for a no-op
// filter. Defense in depth (the server re-validates via `leadConditionInput` and re-checks the
// field/op pairing in compileLeadFilter): drops blank values and pairings outside the allow-list.
// A valueless op (isEmpty / isNotEmpty) is a complete row with a blank value box, so it survives:
// dropping it would make an "is empty" filter look exactly like a filter that matched everything.
// It is emitted with no value key, which is the shape `leadConditionInput` describes.
export function leadRowsToCondition(
  rows: readonly RawCondition[],
  combinator: "and" | "or",
): LeadConditionInput | null {
  const conditions = rows.flatMap((r) => {
    const value = completeRowValue(r.value);
    if (!isLeadField(r.field)) return [];
    if (!OPS_BY_LEAD_FIELD[r.field].includes(r.op)) return [];
    // op validated against the field's allow-list above; narrow to the enum for the definition.
    if (VALUELESS_OPS.has(r.op)) return [{ field: r.field, op: r.op as LeadOp }];
    if (value === null) return [];
    return [{ field: r.field, op: r.op as LeadOp, value }];
  });
  return conditions.length === 0 ? null : { combinator, conditions };
}
