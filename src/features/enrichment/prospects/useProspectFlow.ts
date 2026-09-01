"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { readCsrfToken } from "@/utils/csrfCookie";
import { applyProspectsAction } from "../prospectApplyActions";
import type { ProviderId } from "../providers/types";
import type { ItemOutcome, ReviewSubmission } from "./ProspectReviewStep";
import { prospectActionProfile } from "./profilePayload";
import { type RevealBatch, type RevealedProspect, revealProspects } from "./revealContract";
import { revealErrorMessage } from "./searchMessage";
import type { BadgedProspect } from "./types";
import { useProspectSearch } from "./useProspectSearch";
import { useProspectSelection } from "./useProspectSelection";
import { useRevealQueue } from "./useRevealQueue";

export type ProspectStep = "search" | "reveal" | "review";
export type ApplySummary = "failed" | "partial" | "applied";

const NOTHING: RevealBatch = { items: [], failures: [], mappingsFingerprint: "" };

function existingFor(item: RevealedProspect | undefined): {
  personId: string;
  expectedUpdatedAtIso: string;
} | null {
  const match = item?.match;
  if (match === undefined || match.kind !== "existing") return null;
  return { personId: match.personId, expectedUpdatedAtIso: match.personUpdatedAtIso };
}

function joinChunks(chunks: readonly RevealBatch[]): RevealBatch {
  if (chunks.length === 0) return NOTHING;
  return {
    items: chunks.flatMap((chunk) => chunk.items),
    failures: chunks.flatMap((chunk) => chunk.failures),
    mappingsFingerprint: chunks[chunks.length - 1]?.mappingsFingerprint ?? "",
  };
}

function fingerprintsDiffer(chunks: readonly RevealBatch[]): boolean {
  const first = chunks[0]?.mappingsFingerprint;
  return chunks.some((chunk) => chunk.mappingsFingerprint !== first);
}

export function useProspectFlow(orgId: string, providers: readonly ProviderId[]) {
  const [step, setStep] = useState<ProspectStep>("search");
  const [batchId, setBatchId] = useState<string>(() => crypto.randomUUID());
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [adopted, setAdopted] = useState<RevealBatch | null>(null);
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, ItemOutcome>>>({});
  const [applying, setApplying] = useState(false);
  const generation = useRef(0);
  const [applyError, setApplyError] = useState<string | null>(null);
  const selection = useProspectSelection();
  const search = useProspectSearch(providers, selection);
  const searchProvider = search.filters.provider;

  const send = useCallback(
    async (chunk: BadgedProspect[]): Promise<RevealBatch[]> => {
      const result = await revealProspects(
        {
          orgId,
          batchId,
          searchProvider,
          profiles: chunk.map(prospectActionProfile),
        },
        readCsrfToken(),
      );
      if (!result.ok) {
        throw new AppError(ERROR_IDS.ENRICH_ALL_FAILED, revealErrorMessage(result.error.id), {});
      }
      return [result.value];
    },
    [orgId, batchId, searchProvider],
  );

  const queue = useRevealQueue<BadgedProspect, RevealBatch>({ send });
  const queueResults = queue.results;

  const batch = useMemo(() => adopted ?? joinChunks(queueResults), [adopted, queueResults]);

  const mappingsMismatch = useMemo(
    () => adopted === null && fingerprintsDiffer(queueResults),
    [adopted, queueResults],
  );

  const byRevealed = useMemo(
    () => new Map(batch.items.map((item) => [item.providerRef, item])),
    [batch],
  );

  const startReveal = useCallback(() => {
    const chosen = selection.selected
      .map((ref) => search.byRef.get(ref))
      .filter((profile): profile is BadgedProspect => profile !== undefined);
    setAdopted(null);
    setOutcomes({});
    setApplyError(null);
    setStep("reveal");
    queue.start(chosen);
  }, [selection.selected, search.byRef, queue]);

  const beginResume = useCallback((id: string) => {
    setBatchId(id);
    setResumeId(id);
  }, []);

  const adoptBatch = useCallback((loaded: RevealBatch) => {
    setAdopted(loaded);
    setOutcomes({});
    setApplyError(null);
    setStep("review");
  }, []);

  const apply = useCallback(
    async (submissions: ReviewSubmission[]): Promise<ApplySummary> => {
      const session = generation.current;
      if (mappingsMismatch) {
        setApplyError(ENRICHMENT_STRINGS.prospects.mappingsChangedError);
        return "failed";
      }
      setApplying(true);
      setApplyError(null);
      const result = await applyProspectsAction(
        {
          orgId,
          batchId,
          mappingsFingerprint: batch.mappingsFingerprint,
          items: submissions.map((submission) => ({
            providerRef: submission.providerRef,
            selections: submission.selections,
            existing: existingFor(byRevealed.get(submission.providerRef)),
          })),
        },
        readCsrfToken(),
      );
      const superseded = session !== generation.current;
      if (!superseded) setApplying(false);
      if (!result.ok) {
        if (!superseded) setApplyError(ENRICHMENT_STRINGS.dialog.applyError);
        return "failed";
      }
      const next: Record<string, ItemOutcome> = {};
      for (const outcome of result.value) {
        next[outcome.providerRef] = outcome.result.ok
          ? byRevealed.get(outcome.providerRef)?.match.kind === "existing"
            ? "updated"
            : "created"
          : { errorId: outcome.result.errorId };
      }
      if (!superseded) setOutcomes((current) => ({ ...current, ...next }));
      if (result.value.every((outcome) => outcome.result.ok)) return "applied";
      return result.value.some((outcome) => outcome.result.ok) ? "partial" : "failed";
    },
    [orgId, batchId, batch.mappingsFingerprint, byRevealed, mappingsMismatch],
  );

  const reset = useCallback(() => {
    generation.current += 1;
    setApplying(false);
    setStep("search");
    setOutcomes({});
    setApplyError(null);
    setAdopted(null);
    setResumeId(null);
    setBatchId(crypto.randomUUID());
    search.reset();
    queue.reset();
  }, [search, queue]);

  return {
    step,
    setStep,
    filters: search.filters,
    setFilters: search.setFilters,
    page: search.page,
    searched: search.searched,
    generation: search.generation,
    hasMore: search.hasMore,
    outcome: search.outcome,
    profiles: search.profiles,
    absorbPage: search.absorbPage,
    search: search.search,
    loadMore: search.loadMore,
    batchId,
    resumeId,
    beginResume,
    adoptBatch,
    selection,
    queue,
    revealed: batch.items,
    failures: batch.failures,
    outcomes,
    applying,
    applyError,
    mappingsMismatch,
    startReveal,
    apply,
    reset,
  };
}
