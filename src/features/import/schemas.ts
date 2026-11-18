import { z } from "zod";
import { DEFAULT_IMPORT_SOURCE, type ImportSource } from "@/constants/importSources";
import { DEDUP_MODES } from "@/constants/importStatus";
import type { MappableEntity } from "./importFields";
import {
  ENTITY_FIELDS,
  isFieldOfferedFor,
  isFieldOfferedInGroup,
  primaryEntityOf,
  TARGET_ENTITY_GROUPS,
  targetsFor,
} from "./importFields";
import type { ImportTarget } from "./wizardState";

const MAPPABLE_ENTITIES = [
  "person",
  "organization",
  "deal",
  "lead",
  "activity",
  "note",
] as const satisfies readonly MappableEntity[];

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
      rowNoteFromUnmapped: z.boolean().default(false),
      createMissingStages: z.boolean().default(false),
    })
    .default({ rowNoteFromUnmapped: false, createMissingStages: false }),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export type ColumnMappingInput = z.input<typeof columnMappingSchema>;

interface ResolvedColumnChoice {
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

const LEGACY_LEAD_ORG_FIELD = "orgName";

function resolveChoice(
  choice: z.infer<typeof columnChoiceSchema>,
  target: ImportTarget,
): ResolvedColumnChoice {
  if (choice.entity !== undefined) return { ...choice, entity: choice.entity };
  if (choice.isCustom) return { ...choice, entity: primaryEntityOf(target) };
  if (target === "lead" && choice.field === LEGACY_LEAD_ORG_FIELD) {
    return { entity: "organization", field: "name", isCustom: false, key: "" };
  }
  return { ...choice, entity: primaryEntityOf(target) };
}

export function mappingEntityErrors(
  mapping: unknown,
  target: ImportTarget,
  source: ImportSource = DEFAULT_IMPORT_SOURCE,
): string[] {
  const parsed = columnMappingSchema.safeParse(mapping);
  if (parsed.success === false) return ["mapping is not a valid column mapping"];
  if (!targetsFor(source).includes(target)) {
    return [`a ${source} import cannot target ${target}`];
  }
  const allowed = new Set<MappableEntity>(TARGET_ENTITY_GROUPS[target]);
  const errors: string[] = [];
  if (parsed.data.options.createMissingStages && !(source === "pipedrive" && target === "deal")) {
    errors.push("creating missing stages is only available to a pipedrive deal import");
  }
  for (const [header, choice] of Object.entries(parsed.data.columns)) {
    const entity = choice.entity ?? primaryEntityOf(target);
    if (choice.entity !== undefined && !allowed.has(choice.entity)) {
      errors.push(
        `column "${header}" targets ${choice.entity}, which a ${target} import cannot write`,
      );
    } else if (isSourceOnlyField(entity, choice, source)) {
      errors.push(
        `column "${header}" maps ${entity}.${choice.field}, which a ${source} import does not offer`,
      );
    } else if (isOutsideGroupFields(entity, target, choice)) {
      errors.push(
        `column "${header}" maps ${entity}.${choice.field}, which a ${target} import cannot write`,
      );
    }
  }
  return errors;
}

function isOutsideGroupFields(
  entity: MappableEntity,
  target: ImportTarget,
  choice: { field: string; isCustom: boolean },
): boolean {
  if (choice.isCustom || choice.field === "") return false;
  const field = ENTITY_FIELDS[entity].find((f) => f.field === choice.field);
  return field !== undefined && !isFieldOfferedInGroup(entity, target, field);
}

function isSourceOnlyField(
  entity: MappableEntity,
  choice: { field: string; isCustom: boolean },
  source: ImportSource,
): boolean {
  if (choice.isCustom || choice.field === "") return false;
  const field = ENTITY_FIELDS[entity].find((f) => f.field === choice.field);
  return field !== undefined && !isFieldOfferedFor(field, source);
}

export function normalizeMapping(mapping: unknown, target: ImportTarget): ResolvedColumnMapping {
  const parsed = columnMappingSchema.parse(mapping);
  const columns: Record<string, ResolvedColumnChoice> = {};
  for (const [header, choice] of Object.entries(parsed.columns)) {
    columns[header] = resolveChoice(choice, target);
  }
  return { dedupMode: parsed.dedupMode, options: parsed.options, columns };
}
