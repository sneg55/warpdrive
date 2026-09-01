import { valueSchemaFor } from "@/features/custom-fields/validate";
import { isCustomFieldValueEmpty } from "@/features/custom-fields/valueEmpty";
import type { CustomFieldDef } from "@/types/customFields";

export function carryCustomFields(
  sourceDefs: CustomFieldDef[],
  targetDefs: CustomFieldDef[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const targetByKey = new Map(
    targetDefs.filter((d) => d.archivedAt === null).map((d) => [d.key, d]),
  );
  const out: Record<string, unknown> = {};
  for (const sourceDef of sourceDefs) {
    if (sourceDef.archivedAt !== null) continue;
    const targetDef = targetByKey.get(sourceDef.key);
    if (targetDef === undefined || targetDef.type !== sourceDef.type) continue;
    const value = values[sourceDef.key];
    if (isCustomFieldValueEmpty(value)) continue;
    const parsed = valueSchemaFor(targetDef).safeParse(value);
    if (parsed.success) out[sourceDef.key] = parsed.data;
  }
  return out;
}

export function overlayCustomFields(
  carried: Record<string, unknown>,
  submitted: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...carried };
  for (const [key, value] of Object.entries(submitted)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}
