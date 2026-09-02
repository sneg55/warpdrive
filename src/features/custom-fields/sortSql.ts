import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { CustomFieldTarget } from "@/constants/customFieldTypes";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { CustomFieldDef } from "@/types/customFields";
import { assertNever } from "@/types/result";
import { listDefs } from "./defsRepo";
import {
  customFieldKeyFromColumn,
  isCustomFieldSortKey,
  isSortableCustomFieldType,
} from "./sortKey";

export async function resolveCustomFieldSort(
  db: Db,
  target: CustomFieldTarget,
  field: string,
  signal: AbortSignal,
): Promise<CustomFieldDef> {
  const key = isCustomFieldSortKey(field) ? customFieldKeyFromColumn(field) : undefined;
  const defs = key === undefined ? [] : await listDefs(db, target, {}, signal);
  const def = defs.find((d) => d.key === key && d.archivedAt === null);
  if (def === undefined || !isSortableCustomFieldType(def.type)) {
    throw new AppError(ERROR_IDS.CF_SORT_FIELD_INVALID, "custom-field sort field is not sortable", {
      target,
      field,
    });
  }
  return def;
}

function textExpr(column: PgColumn | SQL, key: string): SQL {
  return sql`NULLIF(${column}->>${key}, '')`;
}

function sortExpr(column: PgColumn | SQL, def: CustomFieldDef): SQL {
  switch (def.type) {
    case "text":
    case "autocomplete":
    case "phone":
      return sql`lower(${textExpr(column, def.key)})`;
    case "date":
    case "time":
      return textExpr(column, def.key);
    case "numeric":
    case "monetary":
      return sql`CASE WHEN jsonb_typeof(${column}->${def.key}) = 'number' THEN (${column}->>${def.key})::numeric END`;
    case "single_option": {
      const live = def.options.filter((o) => o.archived !== true);
      const archived = def.options.filter((o) => o.archived === true);
      const ranked = [...live, ...archived];
      if (ranked.length === 0) return sql`NULL::int`;
      const whens = ranked.map((o, i) => sql`WHEN ${o.id} THEN ${i}::int`);
      return sql`CASE ${column}->>${def.key} ${sql.join(whens, sql` `)} END`;
    }
    case "large_text":
    case "multi_option":
    case "date_range":
    case "time_range":
    case "address":
    case "user":
    case "person":
    case "org":
      throw new AppError(ERROR_IDS.CF_SORT_FIELD_INVALID, "custom-field type is not sortable", {
        type: def.type,
      });
    default:
      return assertNever(def.type);
  }
}

export function customFieldOrderBy(
  column: PgColumn | SQL,
  def: CustomFieldDef,
  dir: "asc" | "desc",
): SQL {
  const expr = sortExpr(column, def);
  return dir === "asc" ? sql`${expr} ASC NULLS LAST` : sql`${expr} DESC NULLS LAST`;
}
