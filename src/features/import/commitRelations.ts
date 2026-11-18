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
import { applyCreateNote } from "./commitNote";
import { createRowNote, type NotableEntity, writeOrgFields } from "./entityLinks";
import type { ImportContext } from "./externalIds";
import { resolveMappedOrgLink, resolveMappedPersonLink } from "./mappedLinks";
import { reassignRowOwners } from "./rowOwners";
import type { ImportTarget } from "./wizardState";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type Created = { entityId: string; side: SideEffects; warnings: RowError[] };
export type Updated = { side: SideEffects; warnings: RowError[] };

class RowRollback extends Error {
  constructor(readonly errors: RowError[]) {
    super("import row rolled back");
  }
}

type PrimaryCreated = { id: string; warnings: RowError[] };

function withoutWarnings(r: Result<string, RowError[]>): Result<PrimaryCreated, RowError[]> {
  return r.ok ? ok({ id: r.value, warnings: [] }) : r;
}

function unwrap<T>(r: Result<T, RowError[]>): T {
  if (r.ok === false) throw new RowRollback(r.error);
  return r.value;
}

async function createPrimary(
  tx: Tx,
  actor: ImportActor,
  target: ImportTarget,
  mapped: Record<string, unknown>,
  links: { orgId: string | null; personId: string | null },
  ctx: ImportContext,
  signal: AbortSignal,
): Promise<Result<PrimaryCreated, RowError[]>> {
  switch (target) {
    case "person":
      return withoutWarnings(
        await applyCreate(tx, actor, "person", { ...mapped, orgId: links.orgId }, signal),
      );
    case "organization":
      return withoutWarnings(await applyCreate(tx, actor, "organization", mapped, signal));
    case "deal":
      return applyCreateDeal(tx, actor, mapped, links, ctx, signal);
    case "lead":
      return withoutWarnings(await applyCreateLead(tx, actor, mapped, links, ctx, signal));
    case "activity":
      return applyCreateActivity(tx, actor, mapped, ctx, signal);
    case "note":
      return applyCreateNote(tx, actor, mapped, ctx, signal);
    default:
      return assertNever(target);
  }
}

function notableTarget(target: ImportTarget): NotableEntity | null {
  return target === "activity" || target === "note" ? null : target;
}

export async function createWithRelations(
  tx: Tx,
  actor: ImportActor,
  target: ImportTarget,
  mapped: MappedRow,
  ctx: ImportContext,
  signal: AbortSignal,
): Promise<Result<Created, RowError[]>> {
  try {
    return await tx.transaction(async (sp) => {
      const side: SideEffects = { ...noSideEffects };
      const links: { orgId: string | null; personId: string | null } = {
        orgId: null,
        personId: null,
      };

      if (mapped.organization !== undefined && target !== "organization") {
        const link = unwrap(
          await resolveMappedOrgLink(sp, actor, ctx, mapped.organization, signal),
        );
        links.orgId = link.id;
        side.createdOrgId = link.createdId;
      }
      if (mapped.person !== undefined && target !== "person") {
        const link = unwrap(await resolveMappedPersonLink(sp, actor, ctx, mapped.person, signal));
        links.personId = link.id;
        side.createdPersonId = link.createdId;
      }

      const primary = unwrap(
        await createPrimary(sp, actor, target, mapped.primary, links, ctx, signal),
      );
      const entityId = primary.id;

      if (target === "organization") {
        unwrap(await writeOrgFields(sp, actor, entityId, mapped.primary, false, signal));
      }

      const notable = notableTarget(target);
      if (mapped.note !== undefined && notable !== null) {
        side.createdNoteId = unwrap(
          await createRowNote(sp, actor, notable, entityId, mapped.note.body, signal),
        );
      }
      const created = { target, primaryId: entityId, side };
      const ownerWarnings = await reassignRowOwners(sp, actor, ctx, created, mapped, signal);
      return ok({ entityId, side, warnings: [...primary.warnings, ...ownerWarnings] });
    });
  } catch (e) {
    if (e instanceof RowRollback) return err(e.errors);
    throw e;
  }
}

export async function updateWithRelations(
  tx: Tx,
  actor: ImportActor,
  target: "person" | "organization",
  candidateId: string,
  mapped: MappedRow,
  ctx: ImportContext,
  signal: AbortSignal,
): Promise<Result<Updated, RowError[]>> {
  try {
    return await tx.transaction(async (sp) => {
      const side: SideEffects = { ...noSideEffects };
      const primary = { ...mapped.primary };

      if (mapped.organization !== undefined && target !== "organization") {
        const link = unwrap(
          await resolveMappedOrgLink(sp, actor, ctx, mapped.organization, signal),
        );
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
      const created = { target, primaryId: null, side };
      const warnings = await reassignRowOwners(sp, actor, ctx, created, mapped, signal);
      return ok({ side, warnings });
    });
  } catch (e) {
    if (e instanceof RowRollback) return err(e.errors);
    throw e;
  }
}
