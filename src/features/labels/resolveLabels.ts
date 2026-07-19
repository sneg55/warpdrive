import type { LabelColor } from "@/constants/labelColors";
import { LABEL_COLOR_CLASSES, LABEL_COLOR_HEX } from "@/constants/labelColors";

// Shared label resolver: turns the strings stored on an entity (deals/leads/persons/orgs keep an
// applied-label name array in a text[] column) into renderable chips, sourcing the color from the
// user-managed label catalog instead of the old hard-coded 3-label constant. Matching is
// case-insensitive so legacy lowercase keys (e.g. "hot") still resolve to their catalog color
// ("Hot"). A stored name with no catalog match renders as a neutral gray chip so it stays visible.

export interface ResolvedLabel {
  name: string;
  classes: string;
}

type CatalogEntry = { name: string; color: LabelColor };

export type LabelColorIndex = Map<string, LabelColor>;

// Build a case-insensitive name -> color index from the catalog ONCE. Callers that resolve labels
// for many rows (board cards, lead cells) build this a single time in their hook and reuse it, so
// per-row resolution is O(applied) lookups instead of rebuilding the whole index on every call.
export function buildLabelColorIndex(catalog: CatalogEntry[]): LabelColorIndex {
  const byName = new Map<string, LabelColor>();
  for (const entry of catalog) {
    byName.set(entry.name.toLowerCase(), entry.color);
  }
  return byName;
}

// Resolve against a prebuilt index (the hot path: called once per row/card).
export function resolveLabelChipsWith(index: LabelColorIndex, applied: string[]): ResolvedLabel[] {
  return applied.map((name) => {
    const color = index.get(name.toLowerCase());
    return { name, classes: LABEL_COLOR_CLASSES[color ?? "gray"] };
  });
}

// Same, projecting to a solid hex fill for the deal board card chips (white text on a saturated
// background rather than the light class chips).
export function resolveLabelColorsWith(
  index: LabelColorIndex,
  applied: string[],
): Array<{ name: string; color: string }> {
  return applied.map((name) => {
    const color = index.get(name.toLowerCase());
    return { name, color: LABEL_COLOR_HEX[color ?? "gray"] };
  });
}

// Convenience wrappers for single-call sites (resolve once per component, not per row).
export function resolveLabelChips(catalog: CatalogEntry[], applied: string[]): ResolvedLabel[] {
  return resolveLabelChipsWith(buildLabelColorIndex(catalog), applied);
}

export function resolveLabelColors(
  catalog: CatalogEntry[],
  applied: string[],
): Array<{ name: string; color: string }> {
  return resolveLabelColorsWith(buildLabelColorIndex(catalog), applied);
}
