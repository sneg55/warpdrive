// Generic, catalog-driven column visibility + order model shared by every list table (leads, deals
// list, people, orgs). Pure functions so the ordering/toggle logic is unit-tested once and every
// list inherits identical behavior. Mirrors the original leads-only useLeadColumns helpers, now
// parameterized by a column catalog + its single pinned column (the row-link anchor).

export interface ColumnDef {
  key: string;
  header: string;
  // Exactly one column per catalog is pinned: always first, never hidden or dragged (the row link).
  pinned?: boolean;
  // Seeds the default visible set before any stored preference loads.
  defaultVisible?: boolean;
}

export function pinnedKey(catalog: readonly ColumnDef[]): string | undefined {
  return catalog.find((c) => c.pinned === true)?.key;
}

function defaultVisibleKeys(catalog: readonly ColumnDef[]): string[] {
  return catalog.filter((c) => c.defaultVisible === true).map((c) => c.key);
}

// Resolve a persisted key list to an ORDERED visible-key array: pinned first, then the stored keys
// in order (known-only, deduped). Falls back to the catalog defaults when stored is empty/unusable.
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

// Toggle a non-pinned column's visibility, appending newly shown columns to the end.
export function toggleColumnOrder(
  catalog: readonly ColumnDef[],
  visible: readonly string[],
  key: string,
): string[] {
  const col = catalog.find((c) => c.key === key);
  if (col === undefined || col.pinned === true) return [...visible];
  return visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key];
}

// Move `from` to `to`'s index. The pinned column is anchored at index 0: never a source or target.
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
