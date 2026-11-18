import type { CustomFieldDef } from "@/types/customFields";

export interface ColumnDef {
  key: string;
  header: string;
  pinned?: boolean;
  defaultVisible?: boolean;
  customField?: CustomFieldDef;
}

export function pinnedKey(catalog: readonly ColumnDef[]): string | undefined {
  return catalog.find((c) => c.pinned === true)?.key;
}

function defaultVisibleKeys(catalog: readonly ColumnDef[]): string[] {
  return catalog.filter((c) => c.defaultVisible === true).map((c) => c.key);
}

export function resolveVisibleOrder(
  catalog: readonly ColumnDef[],
  stored: readonly string[] | undefined,
): string[] {
  const known = new Set(catalog.map((c) => c.key));
  const pin = pinnedKey(catalog);
  const base =
    stored !== undefined && stored.length > 0
      ? stored.filter((k) => known.has(k))
      : defaultVisibleKeys(catalog);
  const ordered: string[] = pin !== undefined ? [pin] : [];
  for (const k of base) if (k !== pin && !ordered.includes(k)) ordered.push(k);
  return ordered;
}

export function toggleColumnOrder(
  catalog: readonly ColumnDef[],
  visible: readonly string[],
  key: string,
): string[] {
  const col = catalog.find((c) => c.key === key);
  if (col === undefined || col.pinned === true) return [...visible];
  return visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key];
}

export function reorderColumns(
  catalog: readonly ColumnDef[],
  visible: readonly string[],
  from: string,
  to: string,
): string[] {
  const pin = pinnedKey(catalog);
  if (from === pin || to === pin) return [...visible];
  const fromIdx = visible.indexOf(from);
  const toIdx = visible.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return [...visible];
  const next = [...visible];
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, from);
  return next;
}
