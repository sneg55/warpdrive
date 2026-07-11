import { z } from "zod";
import type { CustomFieldDef } from "@/types/customFields";
import { assertNever } from "@/types/result";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate = z.string().date();

const addressSchema = z
  .object({
    street: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    postal: z.string().optional(),
    country: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .refine((a) => {
    // country is required when any string subfield is non-empty or any numeric subfield is set.
    const hasText = [a.street, a.city, a.region, a.postal, a.country].some(
      (s) => s != null && s.length > 0,
    );
    const hasCoord = a.lat != null || a.lng != null;
    const hasAny = hasText || hasCoord;
    return !hasAny || (a.country != null && a.country.length > 0);
  }, "country required when any address subfield is present");

const activeOptionIds = (def: CustomFieldDef): string[] =>
  def.options.filter((o) => o.archived !== true).map((o) => o.id);

export function valueSchemaFor(def: CustomFieldDef): z.ZodTypeAny {
  switch (def.type) {
    case "text":
      return z.string().max(255);
    case "large_text":
      return z.string().max(65535);
    case "autocomplete":
      return z.string().max(255);
    case "numeric":
      return z.number().finite();
    case "monetary":
      return z.number().finite().multipleOf(0.01);
    case "single_option": {
      const ids = activeOptionIds(def);
      // No active options means no value is valid: reject everything (fail-closed).
      return ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.never();
    }
    case "multi_option": {
      const ids = activeOptionIds(def);
      // z.array(z.never()) still accepts [] (an empty multi-select is valid).
      const element = ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.never();
      return z.array(element);
    }
    case "date":
      return isoDate;
    case "date_range":
      // Same-day-or-later end. Reversed ranges are rejected.
      return z
        .object({ start: isoDate, end: isoDate })
        .refine((r) => r.end >= r.start, "end before start");
    case "time":
      return hhmm;
    case "time_range":
      // Assumes a same-day range: cross-midnight ranges (end < start) are intentionally rejected.
      return z
        .object({ start: hhmm, end: hhmm })
        .refine((r) => r.end >= r.start, "end before start");
    case "phone":
      return z.string().regex(/^\+?[0-9 ()-]{4,}$/);
    case "user":
    case "person":
    case "org":
      return z.string().uuid();
    case "address":
      return addressSchema;
    default:
      return assertNever(def.type);
  }
}

export function buildCustomFieldsSchema(
  defs: CustomFieldDef[],
): z.ZodType<Record<string, unknown>> {
  const active = defs.filter((d) => d.archivedAt === null);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of active) {
    const base = valueSchemaFor(def);
    shape[def.key] = def.isRequired ? base : base.optional();
  }
  // z.object strips unknown keys by default in Zod v4; .strip() is explicit for clarity.
  return z.object(shape).strip();
}
