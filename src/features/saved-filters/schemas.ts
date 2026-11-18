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
    value: conditionValue.optional(),
  })
  .superRefine((c, ctx) => {
    refineCondition(c, ctx, DEAL_CONDITION_CONFIG);
  });

export const filterDefinition = z.object({
  combinator: z.enum(["and", "or"]).default("and"),
  conditions: z.array(filterCondition).default([]),
  rotting: z.boolean().optional(),
  sort: z.object({ field: z.enum(FILTER_FIELDS), dir: z.enum(SORT_DIRS) }).optional(),
});

export const SAVED_FILTER_TARGET_ENTITIES = ["deal", "person", "organization", "lead"] as const;
export type SavedFilterTargetEntity = (typeof SAVED_FILTER_TARGET_ENTITIES)[number];

const DEFINITION_BY_ENTITY = {
  deal: filterDefinition,
  person: buildFilterSchema(PERSON_FILTER_CONFIG),
  organization: buildFilterSchema(ORG_FILTER_CONFIG),
  lead: buildFilterSchema(LEAD_CONDITION_CONFIG),
} as const;

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

export function updateSavedFilterInputFor(targetEntity: SavedFilterTargetEntity) {
  return z.object({
    name: z.string().min(1).max(120).optional(),
    definition: savedFilterDefinitionSchema(targetEntity).optional(),
    isShared: z.boolean().optional(),
  });
}

export type FilterDefinition = Omit<z.infer<typeof filterDefinition>, "combinator"> & {
  combinator?: "and" | "or";
};
