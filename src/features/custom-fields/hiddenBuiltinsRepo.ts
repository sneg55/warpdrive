import { and, eq } from "drizzle-orm";
import { isBuiltinFieldKey, isBuiltinLocked } from "@/constants/builtinFields";
import type { CustomFieldTarget } from "@/constants/customFieldTypes";
import { CUSTOM_FIELD_TARGETS } from "@/constants/customFieldTypes";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { hiddenBuiltinFields } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";

export async function listHiddenBuiltins(
  db: Db,
  signal: AbortSignal,
): Promise<Record<CustomFieldTarget, Set<string>>> {
  signal.throwIfAborted();
  const rows = await db.select().from(hiddenBuiltinFields);
  const map = Object.fromEntries(CUSTOM_FIELD_TARGETS.map((t) => [t, new Set<string>()])) as Record<
    CustomFieldTarget,
    Set<string>
  >;
  for (const row of rows) map[row.targetEntity].add(row.fieldKey);
  return map;
}

export interface SetBuiltinHiddenInput {
  entity: CustomFieldTarget;
  key: string;
  hidden: boolean;
}

export async function setBuiltinFieldHidden(
  db: Db,
  input: SetBuiltinHiddenInput,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const { entity, key, hidden } = input;
  if (!isBuiltinFieldKey(entity, key)) {
    return err(
      new AppError(ERROR_IDS.CF_BUILTIN_UNKNOWN, "unknown built-in field", { entity, key }),
    );
  }
  if (isBuiltinLocked(entity, key)) {
    return err(
      new AppError(ERROR_IDS.CF_BUILTIN_LOCKED, "locked built-in field cannot be hidden", {
        entity,
        key,
      }),
    );
  }
  if (hidden) {
    await db
      .insert(hiddenBuiltinFields)
      .values({ targetEntity: entity, fieldKey: key })
      .onConflictDoNothing();
  } else {
    await db
      .delete(hiddenBuiltinFields)
      .where(
        and(eq(hiddenBuiltinFields.targetEntity, entity), eq(hiddenBuiltinFields.fieldKey, key)),
      );
  }
  return ok(undefined);
}
