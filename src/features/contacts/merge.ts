import { and, eq, isNull } from "drizzle-orm";
import { CHANGE_FIELD_MERGE } from "@/constants/changeLogFields";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Organization, Person } from "@/db/schema";
import { organizations, persons } from "@/db/schema";
import { recordChange } from "@/features/collaboration/changeLog";
import { lockImportMutation } from "@/features/import/importLock";
import { repointMappings } from "@/features/import/repointMappings";
import { enqueueDealSearchRefreshForPersons } from "@/features/intercom/dealSearch/enqueue";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";
import {
  fieldChoicesSchema,
  gateMerge,
  type MergeArgs,
  repointOrgFks,
  repointPersonFks,
} from "./mergeHelpers";
import { derivePrimaryEmail } from "./primaryEmail";

export type { MergeArgs } from "./mergeHelpers";

export async function mergePersons(
  db: Db,
  actor: PermSetUser,
  args: MergeArgs,
  signal: AbortSignal,
): Promise<Result<Person, AppError>> {
  if (args.survivorId === args.mergedId) {
    return err(new AppError(ERROR_IDS.CONTACT_MERGE_SAME, "same record", args));
  }
  const choices = fieldChoicesSchema.parse(args.fieldChoices);
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    await lockImportMutation(tx, signal);
    const [survivor] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.id, args.survivorId), isNull(persons.deletedAt)));
    const [merged] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.id, args.mergedId), isNull(persons.deletedAt)));
    if (survivor === undefined || merged === undefined) {
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", args));
    }

    const gate = gateMerge(actor, "person", survivor, merged, args);
    if (gate.ok === false) return gate;

    await repointPersonFks(tx, args.survivorId, args.mergedId);
    await repointMappings(tx, "person", args.survivorId, args.mergedId, signal);

    const emails = [...survivor.emails, ...merged.emails].map((e) => ({
      ...e,
      primary: e.primary === true,
    }));
    const phones = [...survivor.phones, ...merged.phones].map((p) => ({
      ...p,
      primary: p.primary === true,
    }));

    const [updated] = await tx
      .update(persons)
      .set({ ...choices, emails, phones, primaryEmail: derivePrimaryEmail(emails) })
      .where(eq(persons.id, args.survivorId))
      .returning();
    if (updated === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "survivor update returned no rows", {}));
    }

    await tx.update(persons).set({ deletedAt: new Date() }).where(eq(persons.id, args.mergedId));
    await recordChange(
      tx,
      {
        entityType: "person",
        entityId: args.survivorId,
        field: CHANGE_FIELD_MERGE,
        oldValue: args.mergedId,
        newValue: args.survivorId,
        actorId: actor.id,
      },
      signal,
    );
    await enqueueDealSearchRefreshForPersons(tx, [args.survivorId], signal);
    return ok(updated);
  });
}

export async function mergeOrgs(
  db: Db,
  actor: PermSetUser,
  args: MergeArgs,
  signal: AbortSignal,
): Promise<Result<Organization, AppError>> {
  if (args.survivorId === args.mergedId) {
    return err(new AppError(ERROR_IDS.CONTACT_MERGE_SAME, "same record", args));
  }
  const choices = fieldChoicesSchema.parse(args.fieldChoices);
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    await lockImportMutation(tx, signal);
    const [survivor] = await tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, args.survivorId), isNull(organizations.deletedAt)));
    const [merged] = await tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, args.mergedId), isNull(organizations.deletedAt)));
    if (survivor === undefined || merged === undefined) {
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", args));
    }

    const gate = gateMerge(actor, "organization", survivor, merged, args);
    if (gate.ok === false) return gate;

    await repointOrgFks(tx, args.survivorId, args.mergedId);
    await repointMappings(tx, "organization", args.survivorId, args.mergedId, signal);

    const [updated] = await tx
      .update(organizations)
      .set({ ...choices })
      .where(eq(organizations.id, args.survivorId))
      .returning();
    if (updated === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "survivor update returned no rows", {}));
    }

    await tx
      .update(organizations)
      .set({ deletedAt: new Date() })
      .where(eq(organizations.id, args.mergedId));
    await recordChange(
      tx,
      {
        entityType: "organization",
        entityId: args.survivorId,
        field: CHANGE_FIELD_MERGE,
        oldValue: args.mergedId,
        newValue: args.survivorId,
        actorId: actor.id,
      },
      signal,
    );
    return ok(updated);
  });
}
