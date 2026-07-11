// Security-critical: compiles a contacts filter AST into a Drizzle SQL fragment ANDed into the
// people / organizations list queries. Modeled on the deals filterAst (same invariants):
//
// 1. FIELD ALLOW-LIST: column references come from a hardcoded per-entity map. An unknown field is
//    rejected with AppError. Field names NEVER reach SQL via interpolation.
// 2. OPERATOR ALLOW-LIST: SQL operator strings come from a hardcoded map (sql.raw of a constant).
// 3. VALUES PARAMETERIZED: every value goes through sql`${value}` (bound parameter). `contains`
//    emits `ILIKE '%' || ${value} || '%'` with constant wildcards and a bound value.
// 4. NARROWS ONLY: produces an AND-able boolean predicate; the caller ANDs the visibility clause.
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { organizations, persons } from "@/db/schema";
// Client-safe field metadata (fields/ops/numeric) lives in a zod- and drizzle-free module so the
// list filter builders can import it without pulling zod, drizzle, or the db schema into the
// client bundle. Here on the server we pair it with the SQL column allow-list below.
import {
  CONTACT_FILTER_OPS,
  type ContactFilterConfig,
  type ContactFilterDefinition,
  type ContactFilterOp,
  ORG_FILTER_CONFIG,
  PERSON_FILTER_CONFIG,
} from "./contactFilterConfig";

export {
  CONTACT_FILTER_OPS,
  type ContactFilterConfig,
  type ContactFilterDefinition,
  type ContactFilterOp,
  ORG_FILTER_CONFIG,
  PERSON_FILTER_CONFIG,
};

// OPERATOR ALLOW-LIST: fixed SQL operator strings, emitted via sql.raw (constant, never user input).
const OP_RAW: Record<Exclude<ContactFilterOp, "contains">, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

// FIELD ALLOW-LIST: per-entity SQL column map, keyed by the same field names as the client config.
// Server-only (references the db schema), so it stays out of the client bundle.
export const PERSON_COLUMN_SQL: Record<string, SQL> = {
  name: sql`${persons.name}`,
  primaryEmail: sql`${persons.primaryEmail}`,
  ownerId: sql`${persons.ownerId}`,
};
export const ORG_COLUMN_SQL: Record<string, SQL> = {
  name: sql`${organizations.name}`,
  industry: sql`${organizations.industry}`,
  employeeCount: sql`${organizations.employeeCount}`,
  ownerId: sql`${organizations.ownerId}`,
};

// Build a Zod schema for one entity's filter, validating field/op pairing + numeric values at the
// boundary so an invalid pairing is rejected before it can throw a Postgres type error mid-query.
function buildFilterSchema(config: ContactFilterConfig) {
  const condition = z
    .object({
      field: z.enum(config.fields as [string, ...string[]]),
      op: z.enum(CONTACT_FILTER_OPS),
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

export const personFilterSchema = buildFilterSchema(PERSON_FILTER_CONFIG);
export const orgFilterSchema = buildFilterSchema(ORG_FILTER_CONFIG);

// Compile a filter AST to a boolean SQL fragment (null when there are no conditions). Independently
// safe: throws AppError for any field/op outside the allow-list even if Zod was bypassed. The SQL
// column map (server-only) is passed in alongside the client-safe field metadata.
export function compileContactFilter(
  def: ContactFilterDefinition,
  config: ContactFilterConfig,
  columnSql: Record<string, SQL>,
): SQL | null {
  if (def.conditions.length === 0) return null;
  const parts = def.conditions.map((c) => {
    const colSql = columnSql[c.field];
    if (colSql === undefined || !(config.opsByField[c.field] ?? []).includes(c.op)) {
      throw new AppError(ERROR_IDS.CONTACT_FILTER_INVALID, "Invalid contacts filter field/op", {
        field: c.field,
        op: c.op,
      });
    }
    if (c.op === "contains") {
      // Constant '%' wildcards; ${c.value} stays a bound parameter (injection payload = literal).
      return sql`${colSql} ILIKE '%' || ${String(c.value)} || '%'`;
    }
    const opRaw = OP_RAW[c.op];
    return sql`${colSql} ${sql.raw(opRaw)} ${c.value}`;
  });
  const joiner = def.combinator === "or" ? sql` OR ` : sql` AND `;
  return sql`(${sql.join(parts, joiner)})`;
}
