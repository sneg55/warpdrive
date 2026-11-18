import type { LabelColor } from "@/constants/labelColors";
import { LABEL_COLOR_CLASSES, LABEL_COLOR_HEX } from "@/constants/labelColors";

export interface ResolvedLabel {
  name: string;
  classes: string;
}

type CatalogEntry = { name: string; color: LabelColor };

export type LabelColorIndex = Map<string, LabelColor>;

export function buildLabelColorIndex(catalog: CatalogEntry[]): LabelColorIndex {
  const byName = new Map<string, LabelColor>();
  for (const entry of catalog) {
    byName.set(entry.name.toLowerCase(), entry.color);
  }
  return byName;
}

export function resolveLabelChipsWith(index: LabelColorIndex, applied: string[]): ResolvedLabel[] {
  return applied.map((name) => {
    const color = index.get(name.toLowerCase());
    return { name, classes: LABEL_COLOR_CLASSES[color ?? "gray"] };
  });
}

export function resolveLabelColorsWith(
  index: LabelColorIndex,
  applied: string[],
): Array<{ name: string; color: string }> {
  return applied.map((name) => {
    const color = index.get(name.toLowerCase());
    return { name, color: LABEL_COLOR_HEX[color ?? "gray"] };
  });
}

export function resolveLabelChips(catalog: CatalogEntry[], applied: string[]): ResolvedLabel[] {
  return resolveLabelChipsWith(buildLabelColorIndex(catalog), applied);
}
