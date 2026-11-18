import { z } from "zod";
import {
  contactPointSchema,
  emailPointSchema,
  personUpdateInput,
} from "@/features/contacts/schemas";
import { foldEmail } from "./personEmailPlan";

type Point = z.infer<typeof contactPointSchema>;

const heldPointSchema = contactPointSchema.extend({
  value: z.string().trim().min(1).max(320),
});

export interface PersonPatchGuard {
  ok: boolean;
  value?: z.infer<typeof personUpdateInput>;
}

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
