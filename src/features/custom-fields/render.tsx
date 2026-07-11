// Custom-field render dispatch: maps each field type to a display string and a UI widget.
// Adding a new field type forces a case here via assertNever (compile-time exhaustiveness).
import { DEFAULT_BASE_CURRENCY } from "@/constants/currency";
import type { CustomFieldDef } from "@/types/customFields";
import { assertNever } from "@/types/result";

// Re-export widgets from sibling file to keep this file under 200 lines.
export { CustomFieldDetail, CustomFieldFormControl } from "./render.widgets";
export type { CustomFieldDef };

const EMPTY = "(empty)";

function labelFor(def: CustomFieldDef, id: string): string {
  return def.options.find((o) => o.id === id)?.label ?? id;
}

// Callers pass the tenant base currency (settings.base_currency via readBaseCurrency);
// DEFAULT_BASE_CURRENCY is only the final fallback when a caller has none.
function formatMoney(n: number, currency = DEFAULT_BASE_CURRENCY): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(n);
}

// Shared blank-value notion for custom fields (undefined/null/""/empty array), used both to
// render the "(empty)" placeholder here and to drive the sidebar's hide-empty-fields funnel
// (FieldRow.empty), so the two never drift apart on what counts as blank.
export function isCustomFieldValueEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function formatCustomFieldDisplay(
  def: CustomFieldDef,
  value: unknown,
  currency = DEFAULT_BASE_CURRENCY,
): string {
  if (isCustomFieldValueEmpty(value)) {
    return EMPTY;
  }

  switch (def.type) {
    case "text":
    case "large_text":
    case "autocomplete":
    case "phone":
    case "date":
    case "time":
      return value as string;

    case "numeric":
      return (value as number).toString();

    case "monetary":
      return formatMoney(value as number, currency);

    case "single_option":
      return labelFor(def, value as string);

    case "multi_option":
      return (value as string[]).map((id) => labelFor(def, id)).join(", ");

    case "date_range":
    case "time_range": {
      const r = value as { start: string; end: string };
      return `${r.start} to ${r.end}`;
    }

    case "user":
    case "person":
    case "org":
      // Full entity-picker (chip/avatar) is a later page concern; string id is the fallback.
      return value as string;

    case "address": {
      const a = value as Record<string, string>;
      return [a.street, a.city, a.region, a.postal, a.country].filter(Boolean).join(", ");
    }

    default:
      return assertNever(def.type);
  }
}
