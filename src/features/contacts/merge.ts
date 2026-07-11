import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Organization, Person } from "@/db/schema";
import { organizations, persons } from "@/db/schema";
import { recordChange } from "@/features/collaboration/changeLog";
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
    signal.throwIfAborted();
    const [survivor] = await tx.select().from(persons).where(eq(persons.id, args.survivorId));
    const [merged] = await tx.select().from(persons).where(eq(persons.id, args.mergedId));
    if (survivor === undefined || merged === undefined) {
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", args));
    }

    const gate = gateMerge(actor, "person", survivor, merged, args);
    if (gate.ok === false) return gate;

    await repointPersonFks(tx, args.survivorId, args.mergedId);

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
        field: "__merge__",
        oldValue: args.mergedId,
        newValue: args.survivorId,
        actorId: actor.id,
      },
      signal,
    );
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
    signal.throwIfAborted();
    const [survivor] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, args.survivorId));
    const [merged] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, args.mergedId));
    if (survivor === undefined || merged === undefined) {
      return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", args));
    }

    const gate = gateMerge(actor, "organization", survivor, merged, args);
    if (gate.ok === false) return gate;

    await repointOrgFks(tx, args.survivorId, args.mergedId);

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
        field: "__merge__",
        oldValue: args.mergedId,
        newValue: args.survivorId,
        actorId: actor.id,
      },
      signal,
    );
    return ok(updated);
  });
}
