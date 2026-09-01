import { z } from "zod";
import { ORG_FILTER_CONFIG, PERSON_FILTER_CONFIG } from "@/features/contacts/contactFilterConfig";
import { LEAD_CONDITION_CONFIG } from "@/features/leads/leadFilterFields";
import { buildFilterSchema, conditionValue, refineCondition } from "@/schemas/filterCondition";
import {
  DEAL_CONDITION_CONFIG,
  FILTER_FIELDS,
  FILTER_OPS,
  OPS_BY_FIELD,
  SORT_DIRS,
} from "./filterFields";

export { FILTER_FIELDS, OPS_BY_FIELD };

export const filterCondition = z
  .object({
    field: z.enum(FILTER_FIELDS),
    op: z.enum(FILTER_OPS),
    // Optional because isEmpty/isNotEmpty compare against no value; required for every other op
    // by the shared refinement, which also runs the numeric, date and labels value checks.
    value: conditionValue.optional(),
  })
  .superRefine((c, ctx) => {
    refineCondition(c, ctx, DEAL_CONDITION_CONFIG);
  });

export const filterDefinition = z.object({
  // How the conditions fold: "and" narrows, "or" widens. Defaults to "and" so a definition saved
  // before the key existed keeps meaning what it meant when it was written.
  combinator: z.enum(["and", "or"]).default("and"),
  conditions: z.array(filterCondition).default([]),
  // Derived "rotting" narrowing: keep only deals sitting in their stage past its rotting_days
  // threshold. Not expressible as a column condition (it compares stage age to a per-stage limit),
  // so it is a first-class flag applied by filterToSql via the joined stages row.
  rotting: z.boolean().optional(),
  sort: z.object({ field: z.enum(FILTER_FIELDS), dir: z.enum(SORT_DIRS) }).optional(),
});

// A saved view belongs to one entity, and each entity has its own field allow-list. Validating a
// definition against the wrong one would let a person view carry a deal-only field like stageId.
export const SAVED_FILTER_TARGET_ENTITIES = ["deal", "person", "organization", "lead"] as const;
export type SavedFilterTargetEntity = (typeof SAVED_FILTER_TARGET_ENTITIES)[number];

const DEFINITION_BY_ENTITY = {
  deal: filterDefinition,
  person: buildFilterSchema(PERSON_FILTER_CONFIG),
  organization: buildFilterSchema(ORG_FILTER_CONFIG),
  lead: buildFilterSchema(LEAD_CONDITION_CONFIG),
} as const;

// The definition validator for one target entity. Server callers (actions, router, saved-view
// plumbing) parse a stored or posted definition through this rather than the deal schema.
export function savedFilterDefinitionSchema(
  targetEntity: SavedFilterTargetEntity,
): (typeof DEFINITION_BY_ENTITY)[SavedFilterTargetEntity] {
  return DEFINITION_BY_ENTITY[targetEntity];
}

const savedFilterBase = {
  name: z.string().min(1).max(120),
  isShared: z.boolean().default(false),
};

export const saveFilterInput = z.discriminatedUnion("targetEntity", [
  z.object({ ...savedFilterBase, targetEntity: z.literal("deal"), definition: filterDefinition }),
  z.object({
    ...savedFilterBase,
    targetEntity: z.literal("person"),
    definition: DEFINITION_BY_ENTITY.person,
  }),
  z.object({
    ...savedFilterBase,
    targetEntity: z.literal("organization"),
    definition: DEFINITION_BY_ENTITY.organization,
  }),
  z.object({
    ...savedFilterBase,
    targetEntity: z.literal("lead"),
    definition: DEFINITION_BY_ENTITY.lead,
  }),
]);

// The update patch carries no targetEntity, so the caller supplies the entity of the row it is
// updating and gets a validator scoped to that entity's fields.
export function updateSavedFilterInputFor(targetEntity: SavedFilterTargetEntity) {
  return z.object({
    name: z.string().min(1).max(120).optional(),
    definition: savedFilterDefinitionSchema(targetEntity).optional(),
    isShared: z.boolean().optional(),
  });
}

// combinator stays optional on the type even though the schema fills it, so a definition built by
// hand (a stored row, a test, an inline builder) reads as AND without restating the default.
export type FilterDefinition = Omit<z.infer<typeof filterDefinition>, "combinator"> & {
  combinator?: "and" | "or";
};
