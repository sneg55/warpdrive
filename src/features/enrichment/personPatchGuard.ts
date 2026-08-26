// The guard that stops a forged enrichment request writing values the ordinary edit form would
// reject. It checks what enrichment INTRODUCES, not what the record already held.
//
// Every person write carries the whole emails array, because updatePerson re-derives primary_email
// from it and a primary held only in the column would otherwise be dropped. Validating that array
// wholesale meant one address that predates validation (an import, a seed, a typo) failed the patch
// and locked the person out of enrichment in every field, which is exactly the record most in need
// of it. Dropping the offending address instead would delete something a colleague typed.
import { z } from "zod";
import {
  contactPointSchema,
  emailPointSchema,
  personUpdateInput,
} from "@/features/contacts/schemas";
import { foldEmail } from "./personEmailPlan";

type Point = z.infer<typeof contactPointSchema>;

// Shape only, no address rule: applied to a point the record already holds, whose value is not
// this write's doing. Length is still bounded so a patch cannot smuggle an unbounded string in
// under cover of an existing address.
const heldPointSchema = contactPointSchema.extend({
  value: z.string().trim().min(1).max(320),
});

export interface PersonPatchGuard {
  ok: boolean;
  value?: z.infer<typeof personUpdateInput>;
}

// `held` is the record's own addresses as stored. A point whose value matches one of them is
// checked for shape alone; anything else has to be a real address.
export function parsePersonPatch(
  personId: string,
  patch: Record<string, unknown>,
  held: readonly string[],
): PersonPatchGuard {
  const emails: unknown = patch.emails;
  const base = personUpdateInput.safeParse({ id: personId, ...patch, emails: undefined });
  if (!base.success) return { ok: false };
  if (!Array.isArray(emails)) return { ok: true, value: base.data };

  const known = new Set(held.map(foldEmail));
  const points: Point[] = [];
  for (const raw of emails) {
    const value = (raw as { value?: unknown }).value;
    const schema =
      typeof value === "string" && known.has(foldEmail(value)) ? heldPointSchema : emailPointSchema;
    const point = schema.safeParse(raw);
    if (!point.success) return { ok: false };
    points.push(point.data);
  }
  return { ok: true, value: { ...base.data, emails: points } };
}
