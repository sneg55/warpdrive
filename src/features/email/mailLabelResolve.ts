import type { LabelColor } from "@/constants/labelColors";
import { LABEL_COLOR_CLASSES } from "@/constants/labelColors";

export interface MailCatalogEntry {
  key: string;
  name: string;
  color: LabelColor;
}

export interface ResolvedMailLabel {
  key: string;
  name: string;
  classes: string;
}

export type MailLabelIndex = Map<string, MailCatalogEntry>;

const indexCache = new WeakMap<MailCatalogEntry[], MailLabelIndex>();

export function buildMailLabelIndex(catalog: MailCatalogEntry[]): MailLabelIndex {
  const cached = indexCache.get(catalog);
  if (cached !== undefined) return cached;
  const byKey = new Map<string, MailCatalogEntry>();
  for (const entry of catalog) byKey.set(entry.key.toLowerCase(), entry);
  indexCache.set(catalog, byKey);
  return byKey;
}

function resolveMailLabelChipsWith(
  index: MailLabelIndex,
  appliedKeys: string[],
): ResolvedMailLabel[] {
  const out: ResolvedMailLabel[] = [];
  for (const key of appliedKeys) {
    const entry = index.get(key.toLowerCase());
    if (entry === undefined) continue;
    out.push({ key, name: entry.name, classes: LABEL_COLOR_CLASSES[entry.color] });
  }
  return out;
}

export function resolveMailLabelChips(
  catalog: MailCatalogEntry[],
  appliedKeys: string[],
): ResolvedMailLabel[] {
  return resolveMailLabelChipsWith(buildMailLabelIndex(catalog), appliedKeys);
}
