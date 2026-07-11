import type { RawCondition } from "@/components/filters/ConditionRowsBuilder";
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
export function leadRowsToCondition(
  rows: readonly RawCondition[],
  combinator: "and" | "or",
): LeadConditionInput | null {
  const conditions = rows.flatMap((r) => {
    const value = r.value.trim();
    if (value === "") return [];
    if (!isLeadField(r.field)) return [];
    if (!OPS_BY_LEAD_FIELD[r.field].includes(r.op)) return [];
    // op validated against the field's allow-list above; narrow to the enum for the definition.
    return [{ field: r.field, op: r.op as LeadOp, value }];
  });
  return conditions.length === 0 ? null : { combinator, conditions };
}
