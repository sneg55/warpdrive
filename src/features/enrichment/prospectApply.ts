import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { ProspectRevealRow } from "@/db/schema/prospects";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { err, ok, type Result } from "@/types/result";
import type { ApplyInput } from "./applyService";
import { applyToPerson } from "./applyWrites";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings } from "./mappingsRepo";
import {
  assertBackedSelections,
  type ProspectApplyItem,
  resolvePerson,
  writeChangeLogs,
} from "./prospectApplyItem";
import { badgeProfiles, type ProspectMatch } from "./prospectDedup";
import { claimReveal, getOwnBatch, markRevealApplied } from "./prospectsRepo";
import type { ProspectProfile } from "./providers/types";
import type { ResolvedMapping } from "./types";

export type { ProspectApplyItem } from "./prospectApplyItem";

export type ProspectApplyResult =
  | { ok: true; personId: string; appliedFields: string[] }
  | { ok: false; errorId: string };

export interface ProspectApplyOutcome {
  providerRef: string;
  result: ProspectApplyResult;
}

export interface ProspectApplyRequest {
  orgId: string;
  batchId: string;
  mappingsFingerprint: string;
  items: ProspectApplyItem[];
}

export async function applyProspects(
  db: Db,
  actor: ContactActor,
  input: ProspectApplyRequest,
  now: Date,
  signal: AbortSignal,
): Promise<Result<ProspectApplyOutcome[], AppError>> {
  signal.throwIfAborted();

  const mappings = await listMappings(db, "person", signal);
  if (mappingsFingerprint(mappings) !== input.mappingsFingerprint) {
    return err(
      new AppError(ERROR_IDS.ENRICH_MAPPINGS_CHANGED, "field mapping changed since the review", {
        batchId: input.batchId,
      }),
    );
  }

  const batch = await getOwnBatch(db, input.batchId, input.orgId, actor.id, signal);
  if (batch.length === 0) {
    return err(
      new AppError(ERROR_IDS.ENRICH_BATCH_NOT_FOUND, "reveal batch not found", {
        batchId: input.batchId,
      }),
    );
  }
  const byRef = new Map(batch.map((row) => [row.providerRef, row]));

  const existingProfiles = input.items
    .filter((item) => item.existing !== null)
    .map((item) => byRef.get(item.providerRef)?.profile)
    .filter((profile): profile is ProspectProfile => profile !== undefined);
  const badges = await badgeProfiles(db, actor, input.orgId, existingProfiles, signal);
  const matchByRef = new Map(badges.map((b) => [b.providerRef, b.match]));

  const outcomes: ProspectApplyOutcome[] = [];
  for (const item of input.items) {
    signal.throwIfAborted();
    const result = await applyItem(
      db,
      actor,
      { orgId: input.orgId, fingerprint: input.mappingsFingerprint },
      {
        item,
        row: byRef.get(item.providerRef),
        mappings,
        match: matchByRef.get(item.providerRef) ?? { kind: "new" },
      },
      now,
      signal,
    );
    outcomes.push({ providerRef: item.providerRef, result });
  }
  return ok(outcomes);
}

async function applyItem(
  db: Db,
  actor: ContactActor,
  scope: { orgId: string; fingerprint: string },
  subject: {
    item: ProspectApplyItem;
    row: ProspectRevealRow | undefined;
    mappings: readonly ResolvedMapping[];
    match: ProspectMatch;
  },
  now: Date,
  signal: AbortSignal,
): Promise<ProspectApplyResult> {
  const { item, row, mappings, match } = subject;
  if (row === undefined) {
    return { ok: false, errorId: ERROR_IDS.ENRICH_INPUT_INVALID };
  }
  try {
    return await db.transaction(async (tx) => {
      const claim = await claimReveal(tx, row.id, now, signal);
      if (!claim.claimed) {
        if (claim.personId === null) {
          return { ok: false as const, errorId: ERROR_IDS.ENRICH_APPLIED_PERSON_GONE };
        }
        return { ok: true as const, personId: claim.personId, appliedFields: [] };
      }
      const personId = await resolvePerson(tx, actor, scope.orgId, item, row, match, signal);
      assertBackedSelections(item.selections, row);

      const applyInput: ApplyInput = {
        runId: row.id,
        selections: item.selections,
        expectedUpdatedAtIso: item.existing?.expectedUpdatedAtIso ?? "",
        mappingsFingerprint: scope.fingerprint,
      };
      const applied = await applyToPerson(
        tx,
        actor,
        { entityId: personId, outcomes: row.outcomes },
        applyInput,
        mappings,
        signal,
        item.existing === null ? "actor-just-created-this-person" : "requires-contact-edit",
      );
      if (!applied.ok) throw applied.error;

      await writeChangeLogs(
        tx,
        actor,
        personId,
        { row, selections: item.selections },
        applied.value,
      );
      await markRevealApplied(tx, row.id, personId, now, signal);
      return { ok: true as const, personId, appliedFields: applied.value.appliedFields };
    });
  } catch (error) {
    if (error instanceof AppError) return { ok: false, errorId: error.id };
    throw error;
  }
}
