import { z } from "zod";
// Field/op/sort allow-list lives in a zod-free module so the client filter builder can import it
// without pulling zod; re-exported here so existing importers of saved-filters/schemas.ts resolve.
import { FILTER_FIELDS, FILTER_OPS, OPS_BY_FIELD, SORT_DIRS } from "./filterFields";

export { FILTER_FIELDS, FILTER_OPS, OPS_BY_FIELD, SORT_DIRS };

export const filterCondition = z
  .object({
    field: z.enum(FILTER_FIELDS),
    op: z.enum(FILTER_OPS),
    value: z.union([z.string(), z.number()]),
  })
  .superRefine((c, ctx) => {
    if (!OPS_BY_FIELD[c.field].includes(c.op)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `operator "${c.op}" is not valid for field "${c.field}"`,
        path: ["op"],
      });
    }
    // Numeric and date fields need a value that parses, or the comparison fails the SQL cast.
    if (c.field === "value" && !Number.isFinite(Number(c.value))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `field "value" needs a numeric value`,
        path: ["value"],
      });
    }
    if (c.field === "expectedCloseDate" && Number.isNaN(Date.parse(String(c.value)))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `field "expectedCloseDate" needs a date value`,
        path: ["value"],
      });
    }
  });

export const filterDefinition = z.object({
  conditions: z.array(filterCondition).default([]),
  // Derived "rotting" narrowing: keep only deals sitting in their stage past its rotting_days
  // threshold. Not expressible as a column condition (it compares stage age to a per-stage limit),
  // so it is a first-class flag applied by filterToSql via the joined stages row.
  rotting: z.boolean().optional(),
  sort: z.object({ field: z.enum(FILTER_FIELDS), dir: z.enum(SORT_DIRS) }).optional(),
});

export const saveFilterInput = z.object({
  name: z.string().min(1).max(120),
  targetEntity: z.literal("deal"),
  definition: filterDefinition,
  isShared: z.boolean().default(false),
});

export const updateSavedFilterInput = z.object({
  name: z.string().min(1).max(120).optional(),
  definition: filterDefinition.optional(),
  isShared: z.boolean().optional(),
});

export type FilterDefinition = z.infer<typeof filterDefinition>;
export type SaveFilterInput = z.infer<typeof saveFilterInput>;
export type UpdateSavedFilterInput = z.infer<typeof updateSavedFilterInput>;
