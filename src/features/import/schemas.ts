import { z } from "zod";
import { DEDUP_MODES } from "@/constants/importStatus";
import type { MappableEntity } from "./importFields";
import { primaryEntityOf, TARGET_ENTITY_GROUPS } from "./importFields";
import type { ImportTarget } from "./wizardState";

const MAPPABLE_ENTITIES = [
  "person",
  "organization",
  "deal",
  "lead",
  "activity",
  "note",
] as const satisfies readonly MappableEntity[];

// `entity` is optional on the wire: batches mapped before cross-entity mapping existed have
// columns without it. normalizeMapping fills it in from the batch's target. Never read `entity`
// off a raw parsed mapping; go through normalizeMapping.
const columnChoiceSchema = z.object({
  entity: z.enum(MAPPABLE_ENTITIES).optional(),
  field: z.string(),
  isCustom: z.boolean(),
  key: z.string(),
});

export const columnMappingSchema = z.object({
  dedupMode: z.enum(DEDUP_MODES).default("skip"),
  columns: z.record(z.string(), columnChoiceSchema),
  options: z
    .object({
      // Collect every unmapped, non-empty cell into a note on the created record.
      rowNoteFromUnmapped: z.boolean().default(false),
    })
    .default({ rowNoteFromUnmapped: false }),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

// What a CALLER may hand in: `options` and per-column `entity` carry defaults, so a mapping
// written before cross-entity mapping existed is still a legal input.
export type ColumnMappingInput = z.input<typeof columnMappingSchema>;

// A column choice with its entity resolved. This, not ColumnMapping, is what mapRow consumes.
export interface ResolvedColumnChoice {
  entity: MappableEntity;
  field: string;
  isCustom: boolean;
  key: string;
}

export interface ResolvedColumnMapping {
  dedupMode: ColumnMapping["dedupMode"];
  options: ColumnMapping["options"];
  columns: Record<string, ResolvedColumnChoice>;
}

// The pre-cross-entity way a lead named its organization: a lead-level "orgName" cell that
// commitLead resolved by find-or-create. It is now organization.name, so old batches decode to
// the same destination and commit to the same records.
const LEGACY_LEAD_ORG_FIELD = "orgName";

function resolveChoice(
  choice: z.infer<typeof columnChoiceSchema>,
  target: ImportTarget,
): ResolvedColumnChoice {
  if (choice.entity !== undefined) return { ...choice, entity: choice.entity };
  // Custom fields are only ever offered for the target's own defs, so they stay primary.
  if (choice.isCustom) return { ...choice, entity: primaryEntityOf(target) };
  if (target === "lead" && choice.field === LEGACY_LEAD_ORG_FIELD) {
    return { entity: "organization", field: "name", isCustom: false, key: "" };
  }
  return { ...choice, entity: primaryEntityOf(target) };
}

// Reject columns aimed at an entity this target cannot write.
//
// column_mapping is client-supplied and nothing downstream re-checks it, so a tampered mapping
// could put a Person group on a Lead import: commit would find-or-create that person, link it to
// nothing (a lead has no personId in this flow), and leave an orphan contact behind. A column with
// no entity is legacy and resolves to the primary, which is always allowed.
export function mappingEntityErrors(mapping: unknown, target: ImportTarget): string[] {
  const parsed = columnMappingSchema.safeParse(mapping);
  if (parsed.success === false) return ["mapping is not a valid column mapping"];
  const allowed = new Set<MappableEntity>(TARGET_ENTITY_GROUPS[target]);
  const errors: string[] = [];
  for (const [header, choice] of Object.entries(parsed.data.columns)) {
    if (choice.entity === undefined) continue;
    if (!allowed.has(choice.entity)) {
      errors.push(
        `column "${header}" targets ${choice.entity}, which a ${target} import cannot write`,
      );
    }
  }
  return errors;
}

// Fill in the entity every column belongs to, so downstream code never has to know that older
// batches wrote a flat, single-entity mapping.
export function normalizeMapping(mapping: unknown, target: ImportTarget): ResolvedColumnMapping {
  const parsed = columnMappingSchema.parse(mapping);
  const columns: Record<string, ResolvedColumnChoice> = {};
  for (const [header, choice] of Object.entries(parsed.columns)) {
    columns[header] = resolveChoice(choice, target);
  }
  return { dedupMode: parsed.dedupMode, options: parsed.options, columns };
}
