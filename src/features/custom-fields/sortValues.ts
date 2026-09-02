import type { CustomFieldDef } from "@/types/customFields";
import { assertNever } from "@/types/result";
import { isSortableCustomFieldType } from "./sortKey";
import { isCustomFieldValueEmpty } from "./valueEmpty";

export function optionRank(def: CustomFieldDef, id: string): number | null {
  const live = def.options.filter((o) => o.archived !== true);
  const archived = def.options.filter((o) => o.archived === true);
  const idx = [...live, ...archived].findIndex((o) => o.id === id);
  return idx < 0 ? null : idx;
}

export function customFieldSortValue(def: CustomFieldDef, value: unknown): string | number | null {
  if (!isSortableCustomFieldType(def.type) || isCustomFieldValueEmpty(value)) return null;
  switch (def.type) {
    case "text":
    case "autocomplete":
    case "phone":
      return typeof value === "string" ? value.toLowerCase() : null;
    case "date":
    case "time":
      return typeof value === "string" ? value : null;
    case "numeric":
    case "monetary":
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    case "single_option":
      return typeof value === "string" ? optionRank(def, value) : null;
    case "large_text":
    case "multi_option":
    case "date_range":
    case "time_range":
    case "address":
    case "user":
    case "person":
    case "org":
      return null;
    default:
      return assertNever(def.type);
  }
}

export function compareCustomFieldValues(
  def: CustomFieldDef,
  a: unknown,
  b: unknown,
  dir: "asc" | "desc",
): number {
  const va = customFieldSortValue(def, a);
  const vb = customFieldSortValue(def, b);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  const base =
    typeof va === "number" && typeof vb === "number"
      ? va - vb
      : String(va).localeCompare(String(vb));
  return dir === "asc" ? base : -base;
}
