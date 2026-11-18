import { z } from "zod";
import { CUSTOM_FIELD_TARGETS } from "@/constants/customFieldTypes";

export const setBuiltinHiddenSchema = z.object({
  entity: z.enum(CUSTOM_FIELD_TARGETS),
  key: z.string().min(1).max(64),
  hidden: z.boolean(),
});
