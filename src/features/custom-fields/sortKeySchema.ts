import { z } from "zod";
import { type CustomFieldSortKey, isCustomFieldSortKey } from "./sortKey";

export const customFieldSortKeySchema = z.string().refine(isCustomFieldSortKey, {
  message: "expected a cf:<key> sort field",
}) as unknown as z.ZodType<CustomFieldSortKey>;
