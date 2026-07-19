import type { LabelColor } from "@/constants/labelColors";
import { LABEL_COLOR_CLASSES } from "@/constants/labelColors";

// Turns the keys stored on a thread (email_threads.labels text[]) into renderable chips, sourcing
// the display name + color from the user-managed mail-label catalog. Matching is case-insensitive
// on the key so the legacy follow-up tokens (important/to_do/later) resolve against the seeded
// built-ins. A stored key with no catalog match is skipped (a stray token never renders an
// unstyled chip), preserving the previous ThreadLabelChips behavior. Client-safe.

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

// key -> entry index, memoized on the catalog array identity. The inbox renders one
// ThreadLabelChips per row and each resolves against the same catalog; React Query hands every row
// the same array reference, so all rows share one index built once rather than rebuilding it per
// thread (O(threads * catalog) -> O(catalog) once + O(applied) per row). The WeakMap lets a
// superseded catalog (a later fetch returns a new array) be garbage-collected.
const indexCache = new WeakMap<MailCatalogEntry[], MailLabelIndex>();

export function buildMailLabelIndex(catalog: MailCatalogEntry[]): MailLabelIndex {
  const cached = indexCache.get(catalog);
  if (cached !== undefined) return cached;
  const byKey = new Map<string, MailCatalogEntry>();
  for (const entry of catalog) byKey.set(entry.key.toLowerCase(), entry);
  indexCache.set(catalog, byKey);
  return byKey;
}

// Resolve against a prebuilt index (the hot path: called once per thread row).
export function resolveMailLabelChipsWith(
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
