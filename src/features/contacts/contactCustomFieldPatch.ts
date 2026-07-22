import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { customFieldDefs, organizations, persons } from "@/db/schema";
import { toDef } from "@/features/custom-fields/defsRepo";
import { valueSchemaFor } from "@/features/custom-fields/validate";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import { err, ok, type Result } from "@/types/result";
import { toVisibleRecord as toVisibleOrg } from "./orgsRepo";
import { type ContactActor, toVisibleRecord as toVisiblePerson } from "./personsRepo";

export const contactCustomFieldPatchInput = z.object({
  entity: z.enum(["person", "organization"]),
  id: z.string().uuid(),
  key: z.string().min(1).max(255),
  value: z.unknown(),
});
export type ContactCustomFieldPatchInput = z.infer<typeof contactCustomFieldPatchInput>;

type PatchResult = Result<{ id: string }, AppError>;

// Inline custom-field edits are patches, not complete entity snapshots. Validate the one active
// definition, then let Postgres merge the one JSON key atomically. The SQL merge preserves
// archived/unknown historical keys and composes correctly with another field save in flight.
export async function patchContactCustomField(
  db: Db,
  actor: ContactActor,
  input: ContactCustomFieldPatchInput,
  signal: AbortSignal,
): Promise<PatchResult> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    const [definition] = await tx
      .select()
      .from(customFieldDefs)
      .where(
        and(
          eq(customFieldDefs.targetEntity, input.entity),
          eq(customFieldDefs.key, input.key),
          isNull(customFieldDefs.archivedAt),
        ),
      );
    if (definition === undefined) {
      return err(
        new AppError(ERROR_IDS.CF_VALUE_INVALID, "unknown or archived custom field key", {
          key: input.key,
        }),
      );
    }

    const parsed = valueSchemaFor(toDef(definition)).safeParse(input.value);
    if (parsed.success === false) {
      return err(
        new AppError(ERROR_IDS.CF_VALUE_INVALID, "custom field value invalid", {
          key: input.key,
          issues: parsed.error.issues,
        }),
      );
    }

    const jsonPatch = JSON.stringify({ [input.key]: parsed.data });

    if (input.entity === "person") {
      const [current] = await tx
        .select()
        .from(persons)
        .where(and(eq(persons.id, input.id), isNull(persons.deletedAt)));
      if (current === undefined || !canSee(actor, toVisiblePerson(current))) {
        return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id: input.id }));
      }
      if (!can(actor, "contact.edit", toVisiblePerson(current))) {
        return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { id: input.id }));
      }
      const [updated] = await tx
        .update(persons)
        .set({ customFields: sql`${persons.customFields} || ${jsonPatch}::jsonb` })
        .where(and(eq(persons.id, input.id), isNull(persons.deletedAt)))
        .returning({ id: persons.id });
      return updated === undefined
        ? err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "update returned no rows", {}))
        : ok(updated);
    }

    const [current] = await tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, input.id), isNull(organizations.deletedAt)));
    if (current === undefined || !canSee(actor, toVisibleOrg(current))) {
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { id: input.id }));
    }
    if (!can(actor, "contact.edit", toVisibleOrg(current))) {
      return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { id: input.id }));
    }
    const [updated] = await tx
      .update(organizations)
      .set({ customFields: sql`${organizations.customFields} || ${jsonPatch}::jsonb` })
      .where(and(eq(organizations.id, input.id), isNull(organizations.deletedAt)))
      .returning({ id: organizations.id });
    return updated === undefined
      ? err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "update returned no rows", {}))
      : ok(updated);
  });
}
