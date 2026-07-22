import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { buildCustomFieldsSchema } from "@/features/custom-fields/validate";
import { err, ok, type Result } from "@/types/result";

// Validate a contact entity's custom fields against its active defs.
// Returns parsed.data (stripped of unknown keys) on success, E_CF_003 on failure.
// Shared by personsRepo and orgsRepo so validation cannot diverge.
export async function validateContactCustomFields(
  db: Db,
  entity: "person" | "organization",
  values: Record<string, unknown>,
  signal: AbortSignal,
  options: { requireImportant?: boolean } = {},
): Promise<Result<Record<string, unknown>, AppError>> {
  const defs = await listDefs(db, entity, {}, signal);
  const parsed = buildCustomFieldsSchema(defs, options).safeParse(values);
  if (parsed.success === false) {
    return err(
      new AppError(ERROR_IDS.CF_VALUE_INVALID, "custom fields invalid", {
        issues: parsed.error.issues,
      }),
    );
  }
  return ok(parsed.data);
}
