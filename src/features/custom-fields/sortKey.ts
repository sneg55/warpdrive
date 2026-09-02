import type { CustomFieldType } from "@/constants/customFieldTypes";
import type { CustomFieldDef } from "@/types/customFields";

export const CUSTOM_FIELD_COLUMN_PREFIX = "cf:";
export const CUSTOM_FIELD_SORT_PATTERN = /^cf:[a-z0-9_]+$/;
export type CustomFieldSortKey = `cf:${string}`;

export const SORTABLE_CUSTOM_FIELD_TYPES: readonly CustomFieldType[] = [
  "text",
  "autocomplete",
  "phone",
  "numeric",
  "monetary",
  "date",
  "time",
  "single_option",
];

export function customFieldColumnKey(def: Pick<CustomFieldDef, "key">): CustomFieldSortKey {
  return `${CUSTOM_FIELD_COLUMN_PREFIX}${def.key}`;
}

export function customFieldKeyFromColumn(key: string): string | undefined {
  return key.startsWith(CUSTOM_FIELD_COLUMN_PREFIX)
    ? key.slice(CUSTOM_FIELD_COLUMN_PREFIX.length)
    : undefined;
}

export function isCustomFieldSortKey(field: string): field is CustomFieldSortKey {
  return CUSTOM_FIELD_SORT_PATTERN.test(field);
}

export function isSortableCustomFieldType(type: CustomFieldType): boolean {
  return SORTABLE_CUSTOM_FIELD_TYPES.includes(type);
}
