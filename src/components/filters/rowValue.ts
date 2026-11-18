export type RowValue = string | string[];

export function completeRowValue(value: RowValue): RowValue | null {
  if (Array.isArray(value)) {
    const picked = value.map((v) => v.trim()).filter((v) => v !== "");
    return picked.length === 0 ? null : picked;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function singleRowValue(value: RowValue): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export function rowValueOf(value: string | number | readonly string[] | undefined): RowValue {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return [...value];
}

export function rowValueList(value: RowValue): string[] {
  if (Array.isArray(value)) return value;
  return value === "" ? [] : [value];
}
