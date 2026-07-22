import { and, asc, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { customFieldDefs } from "@/db/schema";
import { listDefs, toDef } from "@/features/custom-fields/defsRepo";
import { buildCustomFieldsSchema, valueSchemaFor } from "@/features/custom-fields/validate";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";

// Create accepts a full value set and enforces Important as required. Querying through the passed
// DbOrTx keeps this usable at the create trust boundary even when the caller is already in a
// transaction; partial sidebar edits continue to use the cached listDefs path below.
export async function validateDealCustomFieldsForCreate(
  db: DbOrTx,
  values: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<Record<string, unknown>, AppError>> {
  signal.throwIfAborted();
  const rows = await db
    .select()
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.targetEntity, "deal"), isNull(customFieldDefs.archivedAt)))
    .orderBy(asc(customFieldDefs.order), asc(customFieldDefs.id));
  const defs = rows.map(toDef);
  const parsed = buildCustomFieldsSchema(defs, { requireImportant: true }).safeParse(values);
  if (parsed.success === false) {
    return err(
      new AppError(ERROR_IDS.CF_VALUE_INVALID, "custom fields invalid", {
        issues: parsed.error.issues,
      }),
    );
  }
  return ok(parsed.data);
}

// Validate a PARTIAL deal custom-field edit against the active deal defs. Unlike the create-time
// buildCustomFieldsSchema (which validates a full value set and enforces required fields), a sidebar
// edit submits only the changed keys, so this validates each submitted key on its own: an unknown or
// archived key, or a value of the wrong type, is rejected (E_CF_003) instead of being persisted raw.
// Returns the coerced values (parsed per def) on success.
export async function validateDealCustomFieldsPartial(
  db: Db,
  values: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<Record<string, unknown>, AppError>> {
  const defs = await listDefs(db, "deal", {}, signal);
  const activeByKey = new Map(defs.filter((d) => d.archivedAt === null).map((d) => [d.key, d]));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const def = activeByKey.get(key);
    if (def === undefined) {
      return err(
        new AppError(ERROR_IDS.CF_VALUE_INVALID, "unknown or archived custom field key", { key }),
      );
    }
    const parsed = valueSchemaFor(def).safeParse(value);
    if (parsed.success === false) {
      return err(
        new AppError(ERROR_IDS.CF_VALUE_INVALID, "custom field value invalid", {
          key,
          issues: parsed.error.issues,
        }),
      );
    }
    out[key] = parsed.data;
  }
  return ok(out);
}
