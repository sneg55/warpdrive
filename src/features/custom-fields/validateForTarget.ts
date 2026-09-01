import { and, asc, eq, isNull } from "drizzle-orm";
import type { CustomFieldTarget } from "@/constants/customFieldTypes";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { customFieldDefs } from "@/db/schema";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";
import { listDefs, toDef } from "./defsRepo";
import { buildCustomFieldsSchema, valueSchemaFor } from "./validate";

export async function validateCustomFieldsForCreate(
  db: DbOrTx,
  target: CustomFieldTarget,
  values: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<Record<string, unknown>, AppError>> {
  signal.throwIfAborted();
  const rows = await db
    .select()
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.targetEntity, target), isNull(customFieldDefs.archivedAt)))
    .orderBy(asc(customFieldDefs.order), asc(customFieldDefs.id));
  const defs = rows.map(toDef);
  const parsed = buildCustomFieldsSchema(defs, { requireImportant: true }).safeParse(values);
  if (parsed.success === false) {
    return err(
      new AppError(ERROR_IDS.CF_VALUE_INVALID, "custom fields invalid", {
        target,
        issues: parsed.error.issues,
      }),
    );
  }
  return ok(parsed.data);
}

export async function validateCustomFieldsPartial(
  db: Db,
  target: CustomFieldTarget,
  values: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<Record<string, unknown>, AppError>> {
  const defs = await listDefs(db, target, {}, signal);
  const activeByKey = new Map(defs.filter((d) => d.archivedAt === null).map((d) => [d.key, d]));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const def = activeByKey.get(key);
    if (def === undefined) {
      return err(
        new AppError(ERROR_IDS.CF_VALUE_INVALID, "unknown or archived custom field key", {
          target,
          key,
        }),
      );
    }
    const parsed = valueSchemaFor(def).safeParse(value);
    if (parsed.success === false) {
      return err(
        new AppError(ERROR_IDS.CF_VALUE_INVALID, "custom field value invalid", {
          target,
          key,
          issues: parsed.error.issues,
        }),
      );
    }
    out[key] = parsed.data;
  }
  return ok(out);
}
