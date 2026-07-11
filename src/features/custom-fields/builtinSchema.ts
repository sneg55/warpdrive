import { z } from "zod";
import { CUSTOM_FIELD_TARGETS } from "@/constants/customFieldTypes";

// Boundary schema for the hide/unhide built-in field action. The key is validated for shape only
// (non-empty, bounded); whether it is a real, non-locked built-in is enforced in the repo so the
// catalog stays the single source of truth.
export const setBuiltinHiddenSchema = z.object({
  entity: z.enum(CUSTOM_FIELD_TARGETS),
  key: z.string().min(1).max(64),
  hidden: z.boolean(),
});

export type SetBuiltinHiddenActionInput = z.infer<typeof setBuiltinHiddenSchema>;
