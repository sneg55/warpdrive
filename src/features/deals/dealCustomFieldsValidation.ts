import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { valueSchemaFor } from "@/features/custom-fields/validate";
import { err, ok, type Result } from "@/types/result";

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
