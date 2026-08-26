// The checks an apply has to clear before it touches anything: who the caller is, then whether the
// request is even well formed. Separate from applyService.ts to stay inside the file-size budget.
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

// Locks the record and settles authority in one step, before anything reads the run's selections.
// Validating first answered a hidden record's holder differently for a value the run carried than
// for one it did not, which is enough to read the run back a guess at a time.
export async function lockAndAuthorize(
  tx: Db,
  actor: ContactActor,
  entityType: "person" | "organization",
  id: string,
  signal: AbortSignal,
): Promise<Result<Date, AppError>> {
  signal.throwIfAborted();
  const locked = entityType === "person" ? await lockPerson(tx, id) : await lockOrg(tx, id);
  // An invisible record 404s rather than 403ing, so an apply cannot confirm that it exists. The
  // context is empty for the same reason: a run id is not always known beside its record's id, and
  // echoing one back would name the record this answer is meant to keep hidden.
  if (locked === null || canSee(actor, locked.visible) === false) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));
  }
  if (!can(actor, "contact.edit", locked.visible)) {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "contact.edit required", { entityId: id }));
  }
  return ok(locked.updatedAt);
}

// One selection per canonical key, at least one overall. The planner keeps the last value for a
// scalar target while the change log finds the first, so a duplicate writes one and records another.
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
