import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { customFieldDefs } from "@/db/schema";
import type { CustomFieldDef, CustomFieldOption } from "@/types/customFields";
import { err, ok, type Result } from "@/types/result";
import { toDef } from "./defsRepo";

// Read-modify-write of the options jsonb in one transaction. The mutate fn returns
// the next array; callers never remove entries (archive flags in place) so stored
// values, which reference option ids, are never orphaned.
async function writeOptions(
  db: Db,
  id: string,
  mutate: (opts: CustomFieldOption[]) => CustomFieldOption[],
  signal: AbortSignal,
): Promise<Result<CustomFieldDef, AppError>> {
  signal.throwIfAborted();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ options: customFieldDefs.options })
      .from(customFieldDefs)
      .where(eq(customFieldDefs.id, id));
    if (current === undefined) {
      return err(new AppError(ERROR_IDS.CF_DEF_NOT_FOUND, "custom-field def not found", { id }));
    }
    const [row] = await tx
      .update(customFieldDefs)
      .set({ options: mutate(current.options) })
      .where(eq(customFieldDefs.id, id))
      .returning();
    if (row === undefined) {
      return err(new AppError(ERROR_IDS.CF_DEF_NOT_FOUND, "custom-field def not found", { id }));
    }
    return ok(toDef(row));
  });
}

export function addOption(
  db: Db,
  input: { id: string; label: string },
  signal: AbortSignal,
): Promise<Result<CustomFieldDef, AppError>> {
  return writeOptions(
    db,
    input.id,
    (opts) => [...opts, { id: crypto.randomUUID(), label: input.label }],
    signal,
  );
}

export function renameOption(
  db: Db,
  input: { id: string; optionId: string; label: string },
  signal: AbortSignal,
): Promise<Result<CustomFieldDef, AppError>> {
  return writeOptions(
    db,
    input.id,
    (opts) => opts.map((o) => (o.id === input.optionId ? { ...o, label: input.label } : o)),
    signal,
  );
}

export function archiveOption(
  db: Db,
  input: { id: string; optionId: string },
  signal: AbortSignal,
): Promise<Result<CustomFieldDef, AppError>> {
  return writeOptions(
    db,
    input.id,
    (opts) => opts.map((o) => (o.id === input.optionId ? { ...o, archived: true } : o)),
    signal,
  );
}
