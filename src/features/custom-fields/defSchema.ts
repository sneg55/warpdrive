import { z } from "zod";
import { CUSTOM_FIELD_TARGETS, CUSTOM_FIELD_TYPES } from "@/constants/customFieldTypes";

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

export const setDefFlagsInputSchema = z.object({
  id: z.string().uuid(),
  isImportant: z.boolean(),
  showInAddForm: z.boolean(),
});
