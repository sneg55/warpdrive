import {
  customFieldKeyFromColumn,
  isCustomFieldSortKey,
  isSortableCustomFieldType,
} from "@/features/custom-fields/sortKey";
import type { CustomFieldDef } from "@/types/customFields";
import { LEAD_SORT_FIELDS, type LeadBuiltinSortField } from "../schemas";
import { DEFAULT_LEAD_SORT, type LeadSort } from "./useLeadSort";

export function toLeadSort(
  field: string,
  dir: "asc" | "desc",
  defs: readonly CustomFieldDef[],
): LeadSort {
  if ((LEAD_SORT_FIELDS as readonly string[]).includes(field)) {
    return { field: field as LeadBuiltinSortField, dir };
  }
  if (isCustomFieldSortKey(field)) {
    const key = customFieldKeyFromColumn(field);
    const def = defs.find((d) => d.key === key && d.archivedAt === null);
    if (def !== undefined && isSortableCustomFieldType(def.type)) return { field, dir };
  }
  return DEFAULT_LEAD_SORT;
}
