import { and, eq } from "drizzle-orm";
import { BUILTIN_FIELDS, isImportFieldHidden } from "@/constants/builtinFields";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { customFieldDefs } from "@/db/schema";
import { enrichmentFieldMappings, enrichmentSettings } from "@/db/schema/enrichment";
import { listHiddenBuiltins } from "@/features/custom-fields/hiddenBuiltinsRepo";
import { ADDRESS_PREFIX, ENTITY_FIELDS } from "@/features/import/importFields";
import { err, ok, type Result } from "@/types/result";
import { canonicalField, type EnrichEntity, isCanonicalKey, valueTypeOf } from "./canonical";
import { DEFAULT_CACHE_TTL_DAYS } from "./providersRepo";
import { builtinAcceptsCanonical, targetAcceptsType } from "./targetTypes";
import type { ResolvedMapping } from "./types";

export type MappingTarget =
  | { kind: "builtin"; key: string }
  | { kind: "custom"; fieldDefId: string };

const NON_ENRICHABLE_BUILTINS = new Set(["owner", "label", "phones", "address"]);

function dataFieldsOf(entity: EnrichEntity): string[] {
  return BUILTIN_FIELDS[entity]
    .filter((f) => !NON_ENRICHABLE_BUILTINS.has(f.key))
    .map((f) => f.key);
}

export const WRITABLE_BUILTIN_TARGETS: Readonly<Record<EnrichEntity, ReadonlySet<string>>> = {
  organization: new Set([
    ...dataFieldsOf("organization"),
    ...ENTITY_FIELDS.organization
      .filter((f) => f.field.startsWith(ADDRESS_PREFIX))
      .map((f) => f.field),
  ]),
  person: new Set(dataFieldsOf("person")),
};

export async function getCacheTtlDays(db: Db, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  const [row] = await db.select().from(enrichmentSettings);
  return row?.cacheTtlDays ?? DEFAULT_CACHE_TTL_DAYS;
}

export async function setCacheTtlDays(db: Db, days: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await db
    .insert(enrichmentSettings)
    .values({ id: true, cacheTtlDays: days })
    .onConflictDoUpdate({ target: enrichmentSettings.id, set: { cacheTtlDays: days } });
}

export async function listMappings(
  db: Db,
  entity: EnrichEntity,
  signal: AbortSignal,
): Promise<ResolvedMapping[]> {
  signal.throwIfAborted();
  const rows = await db
    .select({
      canonicalKey: enrichmentFieldMappings.canonicalKey,
      targetKind: enrichmentFieldMappings.targetKind,
      targetKey: enrichmentFieldMappings.targetKey,
      targetFieldDefId: enrichmentFieldMappings.targetFieldDefId,
      archivedAt: customFieldDefs.archivedAt,
    })
    .from(enrichmentFieldMappings)
    .leftJoin(customFieldDefs, eq(customFieldDefs.id, enrichmentFieldMappings.targetFieldDefId))
    .where(eq(enrichmentFieldMappings.entity, entity));

  const hidden = (await listHiddenBuiltins(db, signal))[entity];
  const isHidden = (k: string | null): boolean => k !== null && isImportFieldHidden(k, hidden);
  return rows
    .filter((r) => (r.targetKind === "custom" ? r.archivedAt === null : !isHidden(r.targetKey)))
    .map((r) => ({
      canonicalKey: r.canonicalKey,
      label: canonicalField(r.canonicalKey)?.label ?? r.canonicalKey,
      targetKind: r.targetKind,
      targetKey: r.targetKey,
      targetFieldDefId: r.targetFieldDefId,
    }));
}

export async function upsertMapping(
  db: Db,
  entity: EnrichEntity,
  canonicalKey: string,
  target: MappingTarget,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  if (!isCanonicalKey(canonicalKey)) {
    return err(
      new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "unknown canonical key", { canonicalKey }),
    );
  }
  if (canonicalField(canonicalKey)?.entity !== entity) {
    return err(
      new AppError(ERROR_IDS.ENRICH_MAPPING_INVALID, "canonical key belongs to another entity", {
        canonicalKey,
        entity,
      }),
    );
  }

  if (target.kind === "builtin") {
    if (!WRITABLE_BUILTIN_TARGETS[entity].has(target.key)) {
      return err(
        new AppError(ERROR_IDS.ENRICH_MAPPING_INVALID, "target is not a writable built-in field", {
          canonicalKey,
          entity,
          targetKey: target.key,
        }),
      );
    }
    if (!builtinAcceptsCanonical(target.key, canonicalKey)) {
      return err(
        new AppError(ERROR_IDS.ENRICH_MAPPING_INVALID, "target cannot hold that kind of value", {
          canonicalKey,
          targetKey: target.key,
        }),
      );
    }
  }

  if (target.kind === "custom") {
    const invalid = await validateCustomTarget(db, entity, canonicalKey, target.fieldDefId);
    if (invalid !== null) return err(invalid);
  }

  const clash = await targetTaken(db, entity, canonicalKey, target, signal);
  if (clash !== null) return err(targetTakenError(canonicalKey, clash));

  return await writeMapping(db, {
    entity,
    canonicalKey,
    targetKind: target.kind,
    targetKey: target.kind === "builtin" ? target.key : null,
    targetFieldDefId: target.kind === "custom" ? target.fieldDefId : null,
  });
}

async function writeMapping(
  db: Db,
  values: typeof enrichmentFieldMappings.$inferInsert,
): Promise<Result<void, AppError>> {
  try {
    await db
      .insert(enrichmentFieldMappings)
      .values(values)
      .onConflictDoUpdate({
        target: [enrichmentFieldMappings.entity, enrichmentFieldMappings.canonicalKey],
        set: {
          targetKind: values.targetKind,
          targetKey: values.targetKey,
          targetFieldDefId: values.targetFieldDefId,
        },
      });
    return ok(undefined);
  } catch (error) {
    if (!isTargetIndexViolation(error)) throw error;
    return err(targetTakenError(values.canonicalKey, null));
  }
}

function targetTakenError(canonicalKey: string, conflictsWith: string | null): AppError {
  return new AppError(ERROR_IDS.ENRICH_MAPPING_INVALID, "target is already mapped", {
    canonicalKey,
    conflictsWith,
  });
}

const PG_UNIQUE_VIOLATION = "23505";
const TARGET_INDEXES = new Set([
  "enrichment_mapping_builtin_target_unique",
  "enrichment_mapping_custom_target_unique",
]);

function isTargetIndexViolation(error: unknown): boolean {
  for (let cur: unknown = error, d = 0; d < 5 && typeof cur === "object" && cur !== null; d += 1) {
    const code = "code" in cur ? cur.code : undefined;
    const constraint = "constraint" in cur ? cur.constraint : undefined;
    if (code === PG_UNIQUE_VIOLATION && typeof constraint === "string")
      return TARGET_INDEXES.has(constraint);
    cur = "cause" in cur ? cur.cause : undefined;
  }
  return false;
}

async function validateCustomTarget(
  db: Db,
  entity: EnrichEntity,
  canonicalKey: string,
  fieldDefId: string,
): Promise<AppError | null> {
  const [def] = await db.select().from(customFieldDefs).where(eq(customFieldDefs.id, fieldDefId));
  if (def === undefined || def.archivedAt !== null) {
    return new AppError(ERROR_IDS.ENRICH_MAPPING_INVALID, "target field not found", {
      canonicalKey,
    });
  }
  if (def.targetEntity !== entity) {
    return new AppError(
      ERROR_IDS.ENRICH_MAPPING_INVALID,
      "target field belongs to another entity",
      {
        canonicalKey,
        entity,
        fieldEntity: def.targetEntity,
      },
    );
  }
  if (!targetAcceptsType(def.type, valueTypeOf(canonicalKey))) {
    return new AppError(ERROR_IDS.ENRICH_MAPPING_INVALID, "target field type is incompatible", {
      canonicalKey,
      fieldType: def.type,
      valueType: valueTypeOf(canonicalKey),
    });
  }
  return null;
}

async function targetTaken(
  db: Db,
  entity: EnrichEntity,
  canonicalKey: string,
  target: MappingTarget,
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted();
  const rows = await db
    .select({
      canonicalKey: enrichmentFieldMappings.canonicalKey,
      targetKey: enrichmentFieldMappings.targetKey,
      targetFieldDefId: enrichmentFieldMappings.targetFieldDefId,
    })
    .from(enrichmentFieldMappings)
    .where(eq(enrichmentFieldMappings.entity, entity));

  const clash = rows.find(
    (r) =>
      r.canonicalKey !== canonicalKey &&
      (target.kind === "builtin"
        ? r.targetKey === target.key
        : r.targetFieldDefId === target.fieldDefId),
  );
  return clash?.canonicalKey ?? null;
}

export async function clearMapping(
  db: Db,
  entity: EnrichEntity,
  canonicalKey: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db
    .delete(enrichmentFieldMappings)
    .where(
      and(
        eq(enrichmentFieldMappings.entity, entity),
        eq(enrichmentFieldMappings.canonicalKey, canonicalKey),
      ),
    );
}
