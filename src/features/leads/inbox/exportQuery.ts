import { z } from "zod";
import { customFieldSortKeySchema } from "@/features/custom-fields/sortKeySchema";
import {
  LEAD_NEXT_ACTIVITY_BUCKETS,
  LEAD_SORT_FIELDS,
  type LeadConditionInput,
  leadConditionInput,
} from "../schemas";

function splitCsv(s: string | undefined): string[] {
  return s === undefined || s === "" ? [] : s.split(",");
}

function parseCondition(raw: string | undefined): LeadConditionInput | undefined {
  if (raw === undefined || raw === "") return undefined;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = leadConditionInput.safeParse(json);
  return parsed.success ? parsed.data : undefined;
}

export const leadExportQuery = z
  .object({
    filter: z.enum(["inbox", "archived"]).default("inbox"),
    sortField: z.union([z.enum(LEAD_SORT_FIELDS), customFieldSortKeySchema]).default("createdAt"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    ownerIds: z.string().optional(),
    labelKeys: z.string().optional(),
    nextActivity: z.enum(LEAD_NEXT_ACTIVITY_BUCKETS).optional(),
    condition: z.string().optional(),
    columns: z.string().optional(),
  })
  .transform((q) => {
    const ownerIds = splitCsv(q.ownerIds);
    const labelKeys = splitCsv(q.labelKeys);
    return {
      filter: q.filter,
      sort: { field: q.sortField, dir: q.sortDir },
      filters: {
        ownerIds: ownerIds.length > 0 ? ownerIds : undefined,
        labelKeys: labelKeys.length > 0 ? labelKeys : undefined,
        nextActivity: q.nextActivity,
        condition: parseCondition(q.condition),
      },
      columns: splitCsv(q.columns),
    };
  });
