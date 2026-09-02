import { z } from "zod";
import { type CustomFieldSortKey, isCustomFieldSortKey } from "./sortKey";

export const customFieldSortKeySchema: z.ZodType<CustomFieldSortKey> = z.custom<CustomFieldSortKey>(
  (v) => typeof v === "string" && isCustomFieldSortKey(v),
  { message: "expected a cf:<key> sort field" },
);
