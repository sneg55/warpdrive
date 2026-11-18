import { z } from "zod";

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
