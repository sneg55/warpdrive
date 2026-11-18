import { type SQL, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { labelMembershipSql } from "@/features/labels/labelMembershipSql";
import { dateCondition } from "./filterAstDate";
import {
  emptinessCondition,
  requireLabelValue,
  requireValue,
  scalarCondition,
} from "./filterAstSql";
import { DEAL_CONDITION_CONFIG } from "./filterFields";
import type { FilterDefinition } from "./schemas";

const COLUMN_SQL: Record<string, SQL> = {
  status: sql`d.status`,
  value: sql`d.value`,
  stageId: sql`d.stage_id`,
  ownerId: sql`d.owner_id`,
  expectedCloseDate: sql`d.expected_close_date`,
  nextActivityAt: sql`d.next_activity_at`,
  lastActivityAt: sql`d.last_activity_at`,
  wonTime: sql`d.won_time`,
  title: sql`d.title`,
  orgName: sql`o.name`,
  labels: sql`d.labels`,
} as const;

const ARRAY_FIELDS: ReadonlySet<string> = new Set(["labels"]);

const DATE_FIELDS: ReadonlySet<string> = new Set(DEAL_CONDITION_CONFIG.dateFields);

export interface FilterCompileOptions {
  timeZone?: string | null;
}

function conditionSql(c: FilterDefinition["conditions"][number], opts: FilterCompileOptions): SQL {
  const colSql = COLUMN_SQL[c.field];
  if (colSql === undefined) {
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unknown filter field", { field: c.field });
  }

  if (c.op === "isEmpty" || c.op === "isNotEmpty") {
    return emptinessCondition(colSql, c.field, c.op);
  }

  if (ARRAY_FIELDS.has(c.field)) {
    const member = labelMembershipSql(colSql, requireLabelValue(c.op, requireValue(c.op, c.value)));
    if (c.op === "eq") return member;
    if (c.op === "neq") return sql`NOT ${member}`;
    throw new AppError(ERROR_IDS.DEAL_FILTER_INVALID, "Unsupported operator on an array field", {
      field: c.field,
      op: c.op,
    });
  }

  if (DATE_FIELDS.has(c.field)) {
    return dateCondition(colSql, c.field, c.op, c.value, opts.timeZone);
  }

  return scalarCondition(colSql, c.op, c.value);
}

export function filterToSql(def: FilterDefinition, opts: FilterCompileOptions = {}): SQL {
  const parts = def.conditions.map((c) => conditionSql(c, opts));

  const joiner = def.combinator === "or" ? sql` OR ` : sql` AND `;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const group = parts.length === 1 ? parts[0]! : sql`(${sql.join(parts, joiner)})`;

  if (def.rotting === true) {
    const rotting = sql`d.status = 'open' AND s.rotting_days IS NOT NULL AND d.stage_entered_at IS NOT NULL AND d.stage_entered_at <= now() - (s.rotting_days + 1) * interval '1 day'`;
    return parts.length === 0 ? rotting : sql`${group} AND ${rotting}`;
  }

  return parts.length === 0 ? sql`true` : group;
}
