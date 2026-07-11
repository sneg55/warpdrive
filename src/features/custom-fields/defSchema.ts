import { z } from "zod";
import { CUSTOM_FIELD_TARGETS, CUSTOM_FIELD_TYPES } from "@/constants/customFieldTypes";

// Boundary schema for custom-field-definition create input. Mirrors CreateDefInput (defsRepo.ts)
// so the action can trust parsed.data. name is bounded so a def label cannot be blank or absurdly
// long; type/targetEntity are constrained to the known enums so a client cannot smuggle an unknown
// widget kind past the action.
const optionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  color: z.string().optional(),
  archived: z.boolean().optional(),
});

export const createDefInputSchema = z.object({
  targetEntity: z.enum(CUSTOM_FIELD_TARGETS),
  type: z.enum(CUSTOM_FIELD_TYPES),
  name: z.string().trim().min(1).max(80),
  options: z.array(optionSchema).optional(),
  isRequired: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const archiveDefInputSchema = z.object({ id: z.string().uuid() });

// Both flags are required (never partial): the row toggle always sends the full pair, so a
// crafted request can't flip one flag while silently defaulting the other.
export const setDefFlagsInputSchema = z.object({
  id: z.string().uuid(),
  isImportant: z.boolean(),
  showInAddForm: z.boolean(),
});
