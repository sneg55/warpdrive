"use client";
import { useEffect, useRef } from "react";
import { ERROR_IDS } from "@/constants/errorIds";
import { STRINGS } from "@/constants/strings";
import { useImportProgress } from "@/features/import/useImportProgress";
import { trpc } from "@/lib/trpc-client";
import { ProgressBar } from "./ProgressBar";

const IMP = STRINGS.settings.importer;

// The batch fields a wait step reads once its phase finishes.
interface ReadyBatch {
  headers: string[] | null;
  previewRows: Record<string, string>[] | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
}

export interface PhaseWaitProps {
  batchId: string;
  // The status that signals this phase is done (prepare -> mapping_ready, validate -> ready).
  until: "mapping_ready" | "ready";
  onReady: (batch: ReadyBatch) => void;
  onError: (id: string) => void;
  label: string;
}

// Watches a batch through a background phase, showing live progress, then hands the
// finished batch to onReady (or reports failure). Polling backs up the realtime stream.
export function PhaseWait({
  batchId,
  until,
  onReady,
  onError,
  label,
}: PhaseWaitProps): React.ReactNode {
  const progress = useImportProgress(batchId);
  const batch = trpc.import.getBatch.useQuery(
    { batchId },
    {
      refetchInterval: (q) => {
        const s = q.state.data?.status;
        return s === until || s === "failed" ? false : 1000;
      },
    },
  ).data;

  // Mirror the polled batch into a ref (written after commit, not during render, per concurrent-
  // safe ref rules) so the transition effect can read the full batch without depending on its
  // identity. getBatch's data reference changes on every 1s poll tick (progress fields), but the
  // transition should fire only when the phase status actually changes.
  const batchRef = useRef(batch);
  useEffect(() => {
    batchRef.current = batch;
  });
  useEffect(() => {
    // Read status (the trigger) reactively; read the full batch payload from the ref so this only
    // fires on a phase transition, not on every progress-updating poll tick.
    const status = batch?.status;
    if (status === undefined) return;
    const b = batchRef.current;
    if (b === undefined) return;
    if (status === until) onReady(b);
    else if (status === "failed") onError(ERROR_IDS.IMPORT_PARSE_FAILED);
  }, [batch?.status, until, onReady, onError]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{label}</h2>
      <ProgressBar processed={progress.processed} total={progress.total} />
      <p className="text-xs text-muted-foreground">{IMP.importing}</p>
    </section>
  );
}
