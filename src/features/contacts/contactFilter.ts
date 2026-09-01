// Security-critical: compiles a contacts filter AST into a Drizzle SQL fragment ANDed into the
// people / organizations list queries. Modeled on the deals filterAst (same invariants):
//
// 1. FIELD ALLOW-LIST: column references come from a hardcoded per-entity map. An unknown field is
//    rejected with AppError. Field names NEVER reach SQL via interpolation.
// 2. OPERATOR ALLOW-LIST: SQL operator strings come from a hardcoded map (sql.raw of a constant).
// 3. VALUES PARAMETERIZED: every value goes through sql`${value}` (bound parameter). `contains`
//    emits `ILIKE '%' || ${value} || '%'` with constant wildcards and a bound value.
// 4. ARRAY FIELDS: a labels condition compiles to membership over unnest, with one bound name or
//    one bound text[]; a list on any other field is rejected, since drizzle expands it to a tuple.
// 5. NARROWS ONLY: produces an AND-able boolean predicate; the caller ANDs the visibility clause.
import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { organizations, persons } from "@/db/schema";
import { labelMembershipSql } from "@/features/labels/labelMembershipSql";
import { buildFilterSchema } from "@/schemas/filterCondition";
// Client-safe field metadata (fields/ops/numeric) lives in a zod- and drizzle-free module so the
// list filter builders can import it without pulling zod, drizzle, or the db schema into the
// client bundle. Here on the server we pair it with the SQL column allow-list below.
import {
  CONTACT_ARRAY_FIELDS,
  type ContactFilterConfig,
  type ContactFilterDefinition,
  type ContactFilterOp,
  ORG_FILTER_CONFIG,
  PERSON_FILTER_CONFIG,
} from "./contactFilterConfig";
// Per-operator SQL branches (null-safe neq, prefix/negated ILIKE, emptiness) live next door.
import {
  emptinessCondition,
  requireLabelValue,
  requireValue,
  scalarCondition,
} from "./contactFilterSql";

export {
  type ContactFilterConfig,
  type ContactFilterDefinition,
  type ContactFilterOp,
  ORG_FILTER_CONFIG,
  PERSON_FILTER_CONFIG,
};

// FIELD ALLOW-LIST: per-entity SQL column map, keyed by the same field names as the client config.
// Server-only (references the db schema), so it stays out of the client bundle.
export const PERSON_COLUMN_SQL: Record<string, SQL> = {
  name: sql`${persons.name}`,
  primaryEmail: sql`${persons.primaryEmail}`,
  ownerId: sql`${persons.ownerId}`,
  labels: sql`${persons.labels}`,
};
export const ORG_COLUMN_SQL: Record<string, SQL> = {
  name: sql`${organizations.name}`,
  industry: sql`${organizations.industry}`,
  employeeCount: sql`${organizations.employeeCount}`,
  ownerId: sql`${organizations.ownerId}`,
  labels: sql`${organizations.labels}`,
};

// text[] columns compare by membership: "is" means the row carries that label, "is not" means it
// does not. Case-insensitive to match mergeLabelOptions and resolveLabelChips, which collapse case
// variants. The unnest shape is constant and ${value} stays a bound parameter.
function arrayCondition(
  colSql: SQL,
  op: ContactFilterOp,
  value: string | number | string[] | undefined,
): SQL {
  if (op === "isEmpty" || op === "isNotEmpty") return emptinessCondition(colSql, op, "array");
  const member = labelMembershipSql(colSql, requireLabelValue(op, requireValue(op, value)));
  if (op === "eq") return member;
  if (op === "neq") return sql`NOT ${member}`;
  throw new AppError(ERROR_IDS.CONTACT_FILTER_INVALID, "Invalid op for a contacts array field", {
    op,
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
    if (CONTACT_ARRAY_FIELDS.includes(c.field)) {
      return arrayCondition(colSql, c.op, c.value);
    }
    return scalarCondition(colSql, c.op, c.value, config.numericFields.includes(c.field));
  });
  const joiner = def.combinator === "or" ? sql` OR ` : sql` AND `;
  return sql`(${sql.join(parts, joiner)})`;
}
