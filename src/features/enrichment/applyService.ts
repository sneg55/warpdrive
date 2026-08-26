// Applies a reviewed selection. The write goes through updatePerson / updateOrg so enrichment
// inherits their visibility check, contact.edit gate and custom-field validation instead of
// growing a second write path that can drift from them.
import { and, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { changeLogs, organizations, persons } from "@/db/schema";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { err, ok, type Result } from "@/types/result";
import { lockAndAuthorize, validateSelections } from "./applyGuards";
import { applyToOrg, applyToPerson } from "./applyWrites";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { getCacheTtlDays, listMappings } from "./mappingsRepo";
import { isBackedByRun, providersBehind } from "./provenance";
import { getRun, markApplied } from "./runsRepo";
import type { Selection } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ApplyInput {
  runId: string;
  selections: Selection[];
  expectedUpdatedAtIso: string;
  // The mapping targets the preview was computed against, as the dialog was shown them. Merge runs
  // at view time, so this, not anything stored on the run, is what the user actually reviewed.
  mappingsFingerprint: string;
}

export interface Applied {
  // The record's updatedAt after the write. A partial apply moves it, and the dialog stays open, so
  // it needs the new version to apply again without re-running a paid fan-out to learn it.
  entityUpdatedAtIso: string;
  appliedFields: string[];
  // Selected keys that could not be written, such as a company name matching no single
  // organization. The caller tells the user; the fields that did apply are not rolled back.
  unresolved: string[];
}

// A TTL of zero disables the run cache, not the apply: nothing was ever reused, so the run the
// dialog is holding is still the one the user is looking at.
function isExpired(createdAt: Date, ttlDays: number, now: Date): boolean {
  if (ttlDays <= 0) return false;
  return createdAt.getTime() <= now.getTime() - ttlDays * MS_PER_DAY;
}

export async function applyEnrichment(
  db: Db,
  actor: ContactActor,
  input: ApplyInput,
  now: Date,
  signal: AbortSignal,
): Promise<Result<Applied, AppError>> {
  signal.throwIfAborted();

  const run = await getRun(db, input.runId, signal);
  if (run === null) {
    return err(
      new AppError(ERROR_IDS.ENRICH_RUN_NOT_FOUND, "run not found", { runId: input.runId }),
    );
  }
  if (isExpired(run.createdAt, await getCacheTtlDays(db, signal), now)) {
    return err(
      new AppError(ERROR_IDS.ENRICH_RUN_NOT_FOUND, "run is outside the cache TTL", {
        runId: input.runId,
      }),
    );
  }
  // One transaction covers the lock, the staleness check, the write, the change log and the run
  // stamp. Checking updatedAt outside the write let a concurrent edit land in between, and the
  // planner would then have rebuilt whole emails / customFields / address objects from the row it
  // read before that edit, silently reverting it.
  //
  // Failures are thrown rather than returned, because returning a value from the callback RESOLVES
  // the transaction and commits it. A built-in write followed by a rejected custom value would
  // otherwise leave the record changed while the caller was told nothing applied.
  try {
    return await db.transaction(async (tx) => {
      // Authority first. Reading the run's selections before knowing who is asking answers a hidden
      // record's holder differently for a backed value than for a guessed one.
      const authorized = await lockAndAuthorize(tx, actor, run.entityType, run.entityId, signal);
      if (!authorized.ok) throw authorized.error;
      const locked = authorized.value;
      if (locked.toISOString() !== input.expectedUpdatedAtIso) {
        throw new AppError(ERROR_IDS.ENRICH_STALE, "record changed since the run", {
          entityId: run.entityId,
        });
      }

      const shape = validateSelections(input.selections);
      if (!shape.ok) throw shape.error;
      // Every selection has to be something this run reported. Shape and mapping validation alone let
      // a forged request write an arbitrary value and log it with provenance naming nobody.
      const unbacked = input.selections.filter((s) => !isBackedByRun(run.outcomes, s));
      if (unbacked.length > 0) {
        throw new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "selection is not backed by the run", {
          canonicalKeys: unbacked.map((s) => s.canonicalKey),
        });
      }

      const mappings = await listMappings(tx, run.entityType, signal);
      if (mappingsFingerprint(mappings) !== input.mappingsFingerprint) {
        throw new AppError(
          ERROR_IDS.ENRICH_MAPPINGS_CHANGED,
          "field mapping changed since the review",
          { entityType: run.entityType },
        );
      }

      const applied =
        run.entityType === "person"
          ? await applyToPerson(tx, actor, run, input, mappings, signal)
          : await applyToOrg(tx, actor, run, input, mappings, signal);
      if (!applied.ok) throw applied.error;
      const { appliedFields, unresolved, previous, written, appended } = applied.value;

      for (const field of appliedFields) {
        const selection = input.selections.find((s) => s.canonicalKey === field);
        if (selection === undefined) continue;
        await tx.insert(changeLogs).values({
          entityType: run.entityType,
          entityId: run.entityId,
          field,
          // An addition to a set replaced nothing, so naming a previous value would make the
          // timeline read as a swap that never happened.
          oldValue: appended.includes(field) ? null : (previous[field] ?? null),
          newValue: {
            // The planner's coerced value, so the timeline names what the record holds. A company
            // name resolves to a link and has none, so the selection stands.
            value: written[field] ?? selection.value,
            providers: providersBehind(run.outcomes, selection),
          },
          actorId: actor.id,
        });
      }

      // A run that wrote nothing was not applied. Stamping it anyway makes the audit claim a write
      // that never happened, and an unresolved company name is exactly that case.
      if (appliedFields.length > 0) await markApplied(tx, run.id, appliedFields, now, signal);
      const after = await lockRow(tx, run.entityType, run.entityId, signal);
      return ok({
        appliedFields,
        unresolved,
        entityUpdatedAtIso: (after ?? locked).toISOString(),
      });
    });
  } catch (error) {
    // Every failure inside the transaction is an AppError we raised to force the rollback.
    if (error instanceof AppError) return err(error);
    throw error;
  }
}

async function lockRow(
  tx: Db,
  entityType: "person" | "organization",
  id: string,
  signal: AbortSignal,
): Promise<Date | null> {
  signal.throwIfAborted();
  if (entityType === "person") {
    const [row] = await tx
      .select({ updatedAt: persons.updatedAt })
      .from(persons)
      .where(and(eq(persons.id, id), isNull(persons.deletedAt)))
      .for("update");
    return row?.updatedAt ?? null;
  }
  const [row] = await tx
    .select({ updatedAt: organizations.updatedAt })
    .from(organizations)
    .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
    .for("update");
  return row?.updatedAt ?? null;
}
