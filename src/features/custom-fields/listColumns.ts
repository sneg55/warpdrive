import type { ColumnDef } from "@/components/data-table/columnModel";
import type { CustomFieldDef } from "@/types/customFields";
import {
  type CustomFieldSortKey,
  customFieldColumnKey,
  isSortableCustomFieldType,
} from "./sortKey";

export type CustomFieldColumn = ColumnDef & {
  customField: CustomFieldDef;
  sortField?: CustomFieldSortKey;
};

export function customFieldColumns(defs: readonly CustomFieldDef[]): CustomFieldColumn[] {
  return [...defs]
    .filter((d) => d.archivedAt === null && d.key !== "")
    .sort((a, b) => a.order - b.order)
    .map((def) => {
      const key = customFieldColumnKey(def);
      const base: CustomFieldColumn = {
        key,
        header: def.name,
        defaultVisible: false,
        customField: def,
      };
      return isSortableCustomFieldType(def.type) ? { ...base, sortField: key } : base;
    });
}
