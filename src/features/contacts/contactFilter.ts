import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { organizations, persons } from "@/db/schema";
import { labelMembershipSql } from "@/features/labels/labelMembershipSql";
import { buildFilterSchema } from "@/schemas/filterCondition";
import {
  CONTACT_ARRAY_FIELDS,
  type ContactFilterConfig,
  type ContactFilterDefinition,
  type ContactFilterOp,
  ORG_FILTER_CONFIG,
  PERSON_FILTER_CONFIG,
} from "./contactFilterConfig";
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
