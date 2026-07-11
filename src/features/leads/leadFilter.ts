// Security-critical: compiles a leads filter AST into a Drizzle SQL fragment ANDed into the leads
// list query. Modeled on the security-reviewed contacts filterAst (same invariants):
//
// 1. FIELD ALLOW-LIST: column references come from a hardcoded map. An unknown field is rejected
//    with AppError. Field names NEVER reach SQL via interpolation.
// 2. OPERATOR ALLOW-LIST: SQL operator strings come from a hardcoded map (sql.raw of a constant).
// 3. VALUES PARAMETERIZED: every value goes through sql`${value}` (bound parameter). `contains`
//    emits `ILIKE '%' || ${value} || '%'` with constant wildcards and a bound value.
// 4. NARROWS ONLY: produces an AND-able boolean predicate; the caller ANDs the visibility clause.
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { leads } from "@/db/schema/leads";

export const LEAD_FILTER_OPS = ["eq", "neq", "gt", "lt", "gte", "lte", "contains"] as const;
export type LeadFilterOp = (typeof LEAD_FILTER_OPS)[number];

// "contains" first so it defaults for a new text-field condition (substring match is more useful
// than exact-equals for titles).
const TEXT_OPS = ["contains", "eq", "neq"] as const;
const ORDERED_OPS = ["eq", "neq", "gt", "lt", "gte", "lte"] as const;
const EXACT_OPS = ["eq", "neq"] as const;

const OP_RAW: Record<Exclude<LeadFilterOp, "contains">, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

export interface LeadFilterConfig {
  fields: readonly string[];
  columnSql: Record<string, SQL>;
  opsByField: Record<string, readonly string[]>;
  numericFields: readonly string[];
}

export const LEAD_FILTER_CONFIG: LeadFilterConfig = {
  fields: ["title", "value", "sourceOrigin", "ownerId"],
  columnSql: {
    title: sql`${leads.title}`,
    value: sql`${leads.value}`,
    sourceOrigin: sql`${leads.sourceOrigin}`,
    ownerId: sql`${leads.ownerId}`,
  },
  opsByField: {
    title: TEXT_OPS,
    value: ORDERED_OPS,
    sourceOrigin: TEXT_OPS,
    ownerId: EXACT_OPS,
  },
  numericFields: ["value"],
};

// Zod schema validating field/op pairing + numeric values at the boundary so an invalid pairing is
// rejected before it can throw a Postgres type error mid-query.
function buildLeadFilterSchema(config: LeadFilterConfig) {
  const condition = z
    .object({
      field: z.enum(config.fields as [string, ...string[]]),
      op: z.enum(LEAD_FILTER_OPS),
      value: z.union([z.string(), z.number()]),
    })
    .superRefine((c, ctx) => {
      if (!(config.opsByField[c.field] ?? []).includes(c.op)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `operator "${c.op}" is not valid for field "${c.field}"`,
          path: ["op"],
        });
      }
      if (config.numericFields.includes(c.field) && !Number.isFinite(Number(c.value))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `field "${c.field}" needs a numeric value`,
          path: ["value"],
        });
      }
    });
  return z.object({
    combinator: z.enum(["and", "or"]),
    conditions: z.array(condition).max(20),
  });
}

export const leadFilterSchema = buildLeadFilterSchema(LEAD_FILTER_CONFIG);
export type LeadFilterDefinition = {
  combinator: "and" | "or";
  conditions: Array<{ field: string; op: LeadFilterOp; value: string | number }>;
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
    if (c.op === "contains") {
      return sql`${colSql} ILIKE '%' || ${String(c.value)} || '%'`;
    }
    const opRaw = OP_RAW[c.op];
    return sql`${colSql} ${sql.raw(opRaw)} ${c.value}`;
  });
  const joiner = def.combinator === "or" ? sql` OR ` : sql` AND `;
  return sql`(${sql.join(parts, joiner)})`;
}
