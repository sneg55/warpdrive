import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  ARRAY_OPS,
  EXACT_OPS,
  type FilterOpKey,
  ORDERED_OPS,
  TEXT_OPS,
} from "@/constants/filterOps";
import { leads } from "@/db/schema/leads";
import { labelMembershipSql } from "@/features/labels/labelMembershipSql";
import { LEAD_ARRAY_FIELDS } from "./leadFilterFields";
import {
  emptinessCondition,
  requireLabelValue,
  requireValue,
  scalarCondition,
} from "./leadFilterSql";

export type LeadFilterOp = FilterOpKey;

export interface LeadFilterConfig {
  fields: readonly string[];
  columnSql: Record<string, SQL>;
  opsByField: Record<string, readonly string[]>;
  numericFields: readonly string[];
}

export const LEAD_FILTER_CONFIG: LeadFilterConfig = {
  fields: ["title", "value", "sourceOrigin", "ownerId", "labels"],
  columnSql: {
    title: sql`${leads.title}`,
    value: sql`${leads.value}`,
    sourceOrigin: sql`${leads.sourceOrigin}`,
    ownerId: sql`${leads.ownerId}`,
    labels: sql`${leads.labels}`,
  },
  opsByField: {
    title: TEXT_OPS,
    value: ORDERED_OPS,
    sourceOrigin: TEXT_OPS,
    ownerId: EXACT_OPS,
    labels: ARRAY_OPS,
  },
  numericFields: ["value"],
};

function arrayCondition(
  colSql: SQL,
  op: LeadFilterOp,
  value: string | number | string[] | undefined,
): SQL {
  if (op === "isEmpty" || op === "isNotEmpty") return emptinessCondition(colSql, op, "array");
  const member = labelMembershipSql(colSql, requireLabelValue(op, requireValue(op, value)));
  if (op === "eq") return member;
  if (op === "neq") return sql`NOT ${member}`;
  throw new AppError(ERROR_IDS.LEAD_FILTER_INVALID, "Invalid op for a leads array field", { op });
}

export type LeadFilterDefinition = {
  combinator: "and" | "or";
  conditions: Array<{ field: string; op: LeadFilterOp; value?: string | number | string[] }>;
};

export function compileLeadFilter(def: LeadFilterDefinition, config: LeadFilterConfig): SQL | null {
  if (def.conditions.length === 0) return null;
  const parts = def.conditions.map((c) => {
    const colSql = config.columnSql[c.field];
    if (colSql === undefined || !(config.opsByField[c.field] ?? []).includes(c.op)) {
      throw new AppError(ERROR_IDS.LEAD_FILTER_INVALID, "Invalid leads filter field/op", {
        field: c.field,
        op: c.op,
      });
    }
    if (LEAD_ARRAY_FIELDS.includes(c.field)) {
      return arrayCondition(colSql, c.op, c.value);
    }
    return scalarCondition(colSql, c.op, c.value, config.numericFields.includes(c.field));
  });
  const joiner = def.combinator === "or" ? sql` OR ` : sql` AND `;
  return sql`(${sql.join(parts, joiner)})`;
}
