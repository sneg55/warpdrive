// Security-critical: compiles a leads filter AST into a Drizzle SQL fragment ANDed into the leads
// list query. Modeled on the security-reviewed contacts filterAst (same invariants):
//
// 1. FIELD ALLOW-LIST: column references come from a hardcoded map. An unknown field is rejected
//    with AppError. Field names NEVER reach SQL via interpolation.
// 2. OPERATOR ALLOW-LIST: SQL operator strings come from a hardcoded map (sql.raw of a constant).
// 3. VALUES PARAMETERIZED: every value goes through sql`${value}` (bound parameter). `contains`
//    emits `ILIKE '%' || ${value} || '%'` with constant wildcards and a bound value.
// 4. ARRAY FIELDS: a labels condition compiles to membership over unnest, with one bound name or
//    one bound text[]; a list on any other field is rejected, since drizzle expands it to a tuple.
// 5. NARROWS ONLY: produces an AND-able boolean predicate; the caller ANDs the visibility clause.
import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  ARRAY_OPS,
  EXACT_OPS,
  FILTER_OP_KEYS,
  type FilterOpKey,
  ORDERED_OPS,
  TEXT_OPS,
} from "@/constants/filterOps";
import { leads } from "@/db/schema/leads";
import { labelMembershipSql } from "@/features/labels/labelMembershipSql";
import { buildFilterSchema } from "@/schemas/filterCondition";
import { LEAD_ARRAY_FIELDS, LEAD_CONDITION_CONFIG } from "./leadFilterFields";
// Per-operator SQL branches (null-safe neq, prefix/negated ILIKE, emptiness) live next door.
import {
  emptinessCondition,
  requireLabelValue,
  requireValue,
  scalarCondition,
} from "./leadFilterSql";

export const LEAD_FILTER_OPS = FILTER_OP_KEYS;
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

// text[] columns compare by membership: "is" means the row carries that label, "is not" means it
// does not. Case-insensitive to match mergeLabelOptions and resolveLabelChips, which collapse case
// variants. The unnest shape is constant and ${value} stays a bound parameter.
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

export const leadFilterSchema = buildFilterSchema(LEAD_CONDITION_CONFIG);
// value is absent for the valueless ops (isEmpty / isNotEmpty), which compile to a NULL test.
export type LeadFilterDefinition = {
  combinator: "and" | "or";
  conditions: Array<{ field: string; op: LeadFilterOp; value?: string | number | string[] }>;
};

// Compile a filter AST to a boolean SQL fragment (null when there are no conditions). Independently
// safe: throws AppError for any field/op outside the allow-list even if Zod was bypassed.
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
