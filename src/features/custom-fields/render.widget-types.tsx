// Shared types and value-coercion helpers for custom-field widget components.
import type { CustomFieldDef } from "@/types/customFields";

export type DetailProps = { def: CustomFieldDef; value: unknown; currency?: string };
export type ControlProps = {
  def: CustomFieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
};
export type RangeValue = { start: string; end: string };

export function strVal(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function numVal(value: unknown): number | "" {
  return value === undefined || value === null ? "" : (value as number);
}

export function rangeVal(value: unknown): RangeValue {
  if (value !== null && value !== undefined && typeof value === "object" && "start" in value) {
    return value as RangeValue;
  }
  return { start: "", end: "" };
}

export function addrVal(value: unknown): Record<string, string> {
  if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  return {};
}
