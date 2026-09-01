"use client";

import { trpc } from "@/lib/trpc-client";
import { revealProspectsAction } from "../prospectActions";
import type { RevealBatch, RevealedProspect, RevealFailure } from "../revealTypes";

export type { RevealBatch, RevealedProspect, RevealFailure };

export const revealProspects = revealProspectsAction;

export function revealBatchRoute() {
  return trpc.enrichment.revealBatch;
}
