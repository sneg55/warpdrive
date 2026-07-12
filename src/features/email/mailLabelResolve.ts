import type { LabelColor } from "@/constants/labelColors";
import { LABEL_COLOR_CLASSES } from "@/constants/labelColors";

// Turns the keys stored on a thread (email_threads.labels text[]) into renderable chips, sourcing
// the display name + color from the user-managed mail-label catalog. Matching is case-insensitive
// on the key so the legacy follow-up tokens (important/to_do/later) resolve against the seeded
// built-ins. A stored key with no catalog match is skipped (a stray token never renders an
// unstyled chip), preserving the previous ThreadLabelChips behavior. Pure + client-safe.

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

export function resolveMailLabelChips(
  catalog: MailCatalogEntry[],
  appliedKeys: string[],
): ResolvedMailLabel[] {
  const byKey = new Map<string, MailCatalogEntry>();
  for (const entry of catalog) byKey.set(entry.key.toLowerCase(), entry);
  const out: ResolvedMailLabel[] = [];
  for (const key of appliedKeys) {
    const entry = byKey.get(key.toLowerCase());
    if (entry === undefined) continue;
    out.push({ key, name: entry.name, classes: LABEL_COLOR_CLASSES[entry.color] });
  }
  return out;
}
