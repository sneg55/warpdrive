import { z } from "zod";

// Shared trust-boundary schema for an entity's applied labels (deals, leads, persons, orgs all
// store an applied-label name array in a text[] column). Labels are user-managed in
// Settings > Company > Labels, so the valid set is NOT known at parse time and cannot be a Zod
// enum. We validate shape only: each name is non-empty and length-capped, the array is deduped
// case-insensitively, and the count is capped per entity. The catalog UI is the control point for
// which names exist; an unrecognized name renders as a neutral gray chip (see resolveLabelChips)
// rather than being rejected here.
export const LABEL_NAME_MAX = 40;
export const LABELS_PER_ENTITY_MAX = 24;

export const labelNameArray = z
  .array(z.string().trim().min(1).max(LABEL_NAME_MAX))
  .transform((names) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  })
  .pipe(z.array(z.string()).max(LABELS_PER_ENTITY_MAX));
