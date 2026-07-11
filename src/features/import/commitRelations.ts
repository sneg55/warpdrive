import type { Db } from "@/db/client";
import type { MappedRow } from "@/types/import";
import { assertNever, err, ok, type Result } from "@/types/result";
import { applyCreateActivity } from "./commitActivity";
import { applyCreateDeal } from "./commitDeal";
import {
  applyCreate,
  applyUpdate,
  type ImportActor,
  noSideEffects,
  type RowError,
  type SideEffects,
} from "./commitHelpers";
import { applyCreateLead } from "./commitLead";
import {
  createRowNote,
  type NotableEntity,
  resolveOrgLink,
  resolvePersonLink,
  writeOrgFields,
} from "./entityLinks";
import type { ImportTarget } from "./wizardState";

// One CSV row can produce several records: its primary entity, the organization and person it
// names, and a note. This module writes them together, inside ONE savepoint per row, so a failure
// anywhere rolls back everything the row created rather than leaving orphans in the batch
// transaction. commit.ts owns claim/dedup/finalize; this owns "what the row actually writes".

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// What a create produced: the primary entity id, plus the records this row created alongside it
// (org / person / note) so undo can remove them too. Each side-effect id is null when the row
// linked to a pre-existing record rather than creating one.
export type Created = { entityId: string; side: SideEffects };

// Sentinel that rolls the row's SAVEPOINT back while carrying its errors out (drizzle rolls a
// nested transaction back on throw, then re-throws for us to catch).
class RowRollback extends Error {
  constructor(readonly errors: RowError[]) {
    super("import row rolled back");
  }
}

function unwrap<T>(r: Result<T, RowError[]>): T {
  if (r.ok === false) throw new RowRollback(r.error);
  return r.value;
}

// Dispatch CREATE of the row's PRIMARY entity to the right per-entity authority, handing over the
// already-resolved links to its related records. person/organization reuse the shared applyCreate
// (dedup-aware, handled by the caller below); deal/lead/activity have no natural dedup key so they
// always create via their own commit*.ts authority. assertNever guards exhaustiveness: a new
// ImportTarget member fails this switch at compile time.
async function createPrimary(
  tx: Tx,
  actor: ImportActor,
  target: ImportTarget,
  mapped: Record<string, unknown>,
  links: { orgId: string | null; personId: string | null },
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  switch (target) {
    case "person":
      return applyCreate(tx, actor, "person", { ...mapped, orgId: links.orgId }, signal);
    case "organization":
      return applyCreate(tx, actor, "organization", mapped, signal);
    case "deal":
      return applyCreateDeal(tx, actor, mapped, links, signal);
    case "lead":
      return applyCreateLead(tx, actor, mapped, links.orgId, signal);
    case "activity":
      return applyCreateActivity(tx, actor, mapped, signal);
    default:
      return assertNever(target);
  }
}

// Notes attach only to these entity types (ENTITY_TYPES); the map step offers no Note group on an
// activity import, so an activity row can never carry one.
function notableTarget(target: ImportTarget): NotableEntity | null {
  return target === "activity" ? null : target;
}

// Create the row's primary entity plus every related record it described, inside ONE savepoint: a
// failure anywhere (a lead that cannot be created, a note whose entity is invisible) rolls back
// the organization this row just created rather than leaving it orphaned in the batch transaction.
export async function createWithRelations(
  tx: Tx,
  actor: ImportActor,
  target: ImportTarget,
  mapped: MappedRow,
  signal: AbortSignal,
): Promise<Result<Created, RowError[]>> {
  try {
    return await tx.transaction(async (sp) => {
      const side: SideEffects = { ...noSideEffects };
      const links: { orgId: string | null; personId: string | null } = {
        orgId: null,
        personId: null,
      };

      // An organization import writes its org fields as the PRIMARY record, so there is no
      // separate group to resolve; every other target links to one.
      if (mapped.organization !== undefined && target !== "organization") {
        const link = unwrap(await resolveOrgLink(sp, actor, mapped.organization, signal));
        links.orgId = link.id;
        side.createdOrgId = link.createdId;
      }
      if (mapped.person !== undefined && target !== "person") {
        const link = unwrap(await resolvePersonLink(sp, actor, mapped.person, signal));
        links.personId = link.id;
        side.createdPersonId = link.createdId;
      }

      const entityId = unwrap(
        await createPrimary(sp, actor, target, mapped.primary, links, signal),
      );

      // Firmographics are not on orgCreateInput, so an organization import applies them after the
      // create. Nothing to protect on a record this row just made: take every mapped field.
      if (target === "organization") {
        unwrap(await writeOrgFields(sp, actor, entityId, mapped.primary, false, signal));
      }

      const notable = notableTarget(target);
      if (mapped.note !== undefined && notable !== null) {
        side.createdNoteId = unwrap(
          await createRowNote(sp, actor, notable, entityId, mapped.note.body, signal),
        );
      }
      return ok({ entityId, side });
    });
  } catch (e) {
    if (e instanceof RowRollback) return err(e.errors);
    throw e;
  }
}

// Update the matched record, plus the related records the row described. Mirrors
// createWithRelations: one savepoint, so a failed note leaves no half-linked org behind.
export async function updateWithRelations(
  tx: Tx,
  actor: ImportActor,
  target: "person" | "organization",
  candidateId: string,
  mapped: MappedRow,
  signal: AbortSignal,
): Promise<Result<SideEffects, RowError[]>> {
  try {
    return await tx.transaction(async (sp) => {
      const side: SideEffects = { ...noSideEffects };
      const primary = { ...mapped.primary };

      if (mapped.organization !== undefined && target !== "organization") {
        const link = unwrap(await resolveOrgLink(sp, actor, mapped.organization, signal));
        primary.orgId = link.id;
        side.createdOrgId = link.createdId;
      }

      unwrap(await applyUpdate(sp, actor, target, candidateId, primary, signal));

      if (target === "organization") {
        unwrap(await writeOrgFields(sp, actor, candidateId, mapped.primary, false, signal));
      }
      if (mapped.note !== undefined) {
        side.createdNoteId = unwrap(
          await createRowNote(sp, actor, target, candidateId, mapped.note.body, signal),
        );
      }
      return ok(side);
    });
  } catch (e) {
    if (e instanceof RowRollback) return err(e.errors);
    throw e;
  }
}
