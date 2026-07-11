import { z } from "zod";
import {
  LEAD_NEXT_ACTIVITY_BUCKETS,
  LEAD_SORT_FIELDS,
  type LeadConditionInput,
  leadConditionInput,
} from "../schemas";

// Split a comma-joined query param into a non-empty string list ([] when absent/blank).
function splitCsv(s: string | undefined): string[] {
  return s === undefined || s === "" ? [] : s.split(",");
}

// Decode the JSON `condition` param through the same boundary schema the list read uses. A malformed
// or invalid condition (bad JSON, or a non-numeric value for the numeric field) is dropped rather
// than failing the whole export, so a stale/tampered URL never blocks a legitimate download.
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

// Boundary parse for GET /leads/export. Query params arrive as flat strings; validate once here and
// shape them into the LeadListInput-compatible pieces the repo expects. ownerId uuids are
// re-validated by leadListInput.parse inside the repo, so bad values fail closed there too. Label
// values are user-managed catalog names (dynamic), so they pass through as-is rather than being
// whitelisted against a fixed key set.
export const leadExportQuery = z
  .object({
    filter: z.enum(["inbox", "archived"]).default("inbox"),
    sortField: z.enum(LEAD_SORT_FIELDS).default("createdAt"),
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
export type LeadExportQuery = z.infer<typeof leadExportQuery>;
