import { and, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { organizations, persons } from "@/db/schema";
import { toVisibleRecord as toVisibleOrg } from "@/features/contacts/orgsRepo";
import {
  type ContactActor,
  toVisibleRecord as toVisiblePerson,
} from "@/features/contacts/personsRepo";
import { can } from "@/features/permissions/can";
import { canSee } from "@/features/permissions/canSee";
import { err, ok, type Result } from "@/types/result";
import type { Selection } from "./types";

type VisibleRecord = ReturnType<typeof toVisiblePerson>;
type Locked = { updatedAt: Date; visible: VisibleRecord };

async function lockPerson(tx: Db, id: string): Promise<Locked | null> {
  const [row] = await tx
    .select()
    .from(persons)
    .where(and(eq(persons.id, id), isNull(persons.deletedAt)))
    .for("update");
  return row === undefined ? null : { updatedAt: row.updatedAt, visible: toVisiblePerson(row) };
}

async function lockOrg(tx: Db, id: string): Promise<Locked | null> {
  const [row] = await tx
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
    .for("update");
  return row === undefined ? null : { updatedAt: row.updatedAt, visible: toVisibleOrg(row) };
}

export async function lockAndAuthorize(
  tx: Db,
  actor: ContactActor,
  entityType: "person" | "organization",
  id: string,
  signal: AbortSignal,
): Promise<Result<Date, AppError>> {
  signal.throwIfAborted();
  const locked = entityType === "person" ? await lockPerson(tx, id) : await lockOrg(tx, id);
  if (locked === null || canSee(actor, locked.visible) === false) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));
  }
  if (!can(actor, "contact.edit", locked.visible)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { entityId: id }));
  }
  return ok(locked.updatedAt);
}

export function validateSelections(selections: readonly Selection[]): Result<void, AppError> {
  if (selections.length === 0) {
    return err(new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "no fields selected", {}));
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const selection of selections) {
    if (seen.has(selection.canonicalKey)) duplicates.add(selection.canonicalKey);
    seen.add(selection.canonicalKey);
  }
  if (duplicates.size > 0) {
    return err(
      new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "a canonical key was selected twice", {
        canonicalKeys: [...duplicates],
      }),
    );
  }
  return ok(undefined);
}
