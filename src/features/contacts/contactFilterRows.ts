import { completeRowValue, type RowValue, singleRowValue } from "@/components/filters/rowValue";
import { FILTER_OP_LABELS, VALUELESS_OPS } from "@/constants/filterOps";
import {
  CONTACT_ARRAY_FIELDS,
  type ContactFilterConfig,
  type ContactFilterDefinition,
  type ContactFilterOp,
} from "./contactFilterConfig";

export interface BuilderRow {
  field: string;
  op: ContactFilterOp;
  value: RowValue;
}

export const OP_LABELS: Record<ContactFilterOp, string> = FILTER_OP_LABELS;

export const PERSON_FILTER_LABELS: Record<string, string> = {
  name: "Name",
  primaryEmail: "Email",
  ownerId: "Owner",
  labels: "Label",
};
export const ORG_FILTER_LABELS: Record<string, string> = {
  name: "Name",
  industry: "Industry",
  employeeCount: "Employees",
  ownerId: "Owner",
  labels: "Label",
};

export type FieldKind = "text" | "number" | "owner" | "label";
export function fieldKind(config: ContactFilterConfig, field: string): FieldKind {
  if (field === "ownerId") return "owner";
  if (CONTACT_ARRAY_FIELDS.includes(field)) return "label";
  if (config.numericFields.includes(field)) return "number";
  return "text";
}

export function rowsToDefinition(
  combinator: "and" | "or",
  rows: readonly BuilderRow[],
  config: ContactFilterConfig,
): ContactFilterDefinition | null {
  const conditions = rows.flatMap((r) => {
    if (!config.fields.includes(r.field)) return [];
    if (!(config.opsByField[r.field] ?? []).includes(r.op)) return [];
    if (VALUELESS_OPS.has(r.op)) return [{ field: r.field, op: r.op }];
    const picked = completeRowValue(r.value);
    if (picked === null) return [];
    if (!config.numericFields.includes(r.field))
      return [{ field: r.field, op: r.op, value: picked }];
    const numeric = Number(singleRowValue(picked));
    if (!Number.isFinite(numeric)) return [];
    return [{ field: r.field, op: r.op, value: numeric }];
  });
  return conditions.length === 0 ? null : { combinator, conditions };
}
