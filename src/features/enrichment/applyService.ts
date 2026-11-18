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
  mappingsFingerprint: string;
}

export interface Applied {
  entityUpdatedAtIso: string;
  appliedFields: string[];
  unresolved: string[];
}

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
  try {
    return await db.transaction(async (tx) => {
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

      const subject = { entityId: run.entityId, outcomes: run.outcomes };
      const applied =
        run.entityType === "person"
          ? await applyToPerson(tx, actor, subject, input, mappings, signal)
          : await applyToOrg(tx, actor, subject, input, mappings, signal);
      if (!applied.ok) throw applied.error;
      const { appliedFields, unresolved, previous, written, appended } = applied.value;

      for (const field of appliedFields) {
        const selection = input.selections.find((s) => s.canonicalKey === field);
        if (selection === undefined) continue;
        await tx.insert(changeLogs).values({
          entityType: run.entityType,
          entityId: run.entityId,
          field,
          oldValue: appended.includes(field) ? null : (previous[field] ?? null),
          newValue: {
            value: written[field] ?? selection.value,
            providers: providersBehind(run.outcomes, selection),
          },
          actorId: actor.id,
        });
      }

      if (appliedFields.length > 0) await markApplied(tx, run.id, appliedFields, now, signal);
      const after = await lockRow(tx, run.entityType, run.entityId, signal);
      return ok({
        appliedFields,
        unresolved,
        entityUpdatedAtIso: (after ?? locked).toISOString(),
      });
    });
  } catch (error) {
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
