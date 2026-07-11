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

function colorByName(catalog: CatalogEntry[]): Map<string, LabelColor> {
  const byName = new Map<string, LabelColor>();
  for (const entry of catalog) {
    byName.set(entry.name.toLowerCase(), entry.color);
  }
  return byName;
}

export function resolveLabelChips(catalog: CatalogEntry[], applied: string[]): ResolvedLabel[] {
  const byName = colorByName(catalog);
  return applied.map((name) => {
    const color = byName.get(name.toLowerCase());
    return { name, classes: LABEL_COLOR_CLASSES[color ?? "gray"] };
  });
}

// Same resolution but projecting to a solid hex fill, for the deal board card chips (white text on
// a saturated background rather than the light class chips).
export function resolveLabelColors(
  catalog: CatalogEntry[],
  applied: string[],
): Array<{ name: string; color: string }> {
  const byName = colorByName(catalog);
  return applied.map((name) => {
    const color = byName.get(name.toLowerCase());
    return { name, color: LABEL_COLOR_HEX[color ?? "gray"] };
  });
}
