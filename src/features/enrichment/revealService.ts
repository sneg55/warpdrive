import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PROSPECT_REVEAL_CHUNK, PROSPECT_SELECTION_MAX } from "@/constants/prospectSearch";
import type { Db } from "@/db/client";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { err, ok, type Result } from "@/types/result";
import { loadOrg } from "./current";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings } from "./mappingsRepo";
import { prospectMergeBases } from "./prospectMerge";
import { getOwnBatch } from "./prospectsRepo";
import { providerFor } from "./providers/registry";
import type { EnrichmentProvider, ProviderId } from "./providers/types";
import { listUsableProviders } from "./providersRepo";
import { authoriseReveal } from "./revealGuards";
import { baseFor, revealedFrom, revealOne } from "./revealProfile";
import type {
  RevealBatch,
  RevealContext,
  RevealedProspect,
  RevealFailure,
  RevealProspectsInput,
} from "./revealTypes";

export type {
  RevealBatch,
  RevealedProspect,
  RevealFailure,
  RevealProspectsInput,
} from "./revealTypes";

function failureIdOf(reason: unknown): string {
  return reason instanceof AppError ? reason.id : ERROR_IDS.ENRICH_REVEAL_INCOMPLETE;
}

export async function revealProspects(
  db: Db,
  actor: ContactActor,
  input: RevealProspectsInput,
  now: Date,
  signal: AbortSignal,
  resolveProvider: (id: ProviderId) => EnrichmentProvider = providerFor,
): Promise<Result<RevealBatch, AppError>> {
  signal.throwIfAborted();
  if (input.profiles.length > PROSPECT_REVEAL_CHUNK) {
    return err(
      new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "chunk larger than one reveal batch", {
        size: input.profiles.length,
      }),
    );
  }

  const authorised = authoriseReveal(actor, await loadOrg(db, input.orgId, signal));
  if (!authorised.ok) return authorised;
  const org = authorised.value;

  const stored = await getOwnBatch(db, input.batchId, input.orgId, actor.id, signal);
  const byRef = new Map(stored.map((row) => [row.providerRef, row]));
  const pending = input.profiles.filter((p) => !byRef.has(p.providerRef));
  if (stored.length + pending.length > PROSPECT_SELECTION_MAX) {
    return err(
      new AppError(ERROR_IDS.ENRICH_SELECTION_TOO_LARGE, "batch past the selection cap", {
        stored: stored.length,
        pending: pending.length,
      }),
    );
  }

  const mappings = await listMappings(db, "person", signal);
  const fingerprint = mappingsFingerprint(mappings);
  const bases = await prospectMergeBases(
    db,
    actor,
    input.orgId,
    input.profiles.map((p) => byRef.get(p.providerRef)?.profile ?? p),
    mappings,
    signal,
  );

  const items: RevealedProspect[] = [];
  for (const profile of input.profiles) {
    const row = byRef.get(profile.providerRef);
    if (row === undefined) continue;
    items.push(revealedFrom(row, baseFor(bases, row.providerRef), mappings));
  }
  if (pending.length === 0) {
    return ok({ items, failures: [], mappingsFingerprint: fingerprint });
  }

  const usable = await listUsableProviders(db, now, signal);
  if (usable.length === 0) {
    return err(new AppError(ERROR_IDS.ENRICH_NO_PROVIDER, "no usable enrichment provider", {}));
  }

  const ctx: RevealContext = { actor, org, input, usable, mappings, bases, resolveProvider };
  const settled = await Promise.allSettled(
    pending.map((profile) => revealOne(db, ctx, profile, now, signal)),
  );
  signal.throwIfAborted();

  const failures: RevealFailure[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(result.value);
      return;
    }
    const providerRef = pending[index]?.providerRef;
    if (providerRef === undefined) return;
    failures.push({ providerRef, errorId: failureIdOf(result.reason) });
  });
  return ok({ items, failures, mappingsFingerprint: fingerprint });
}
