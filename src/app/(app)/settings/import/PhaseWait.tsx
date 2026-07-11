"use client";
import { useEffect } from "react";
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

  useEffect(() => {
    if (batch === undefined) return;
    if (batch.status === until) onReady(batch);
    else if (batch.status === "failed") onError(ERROR_IDS.IMPORT_PARSE_FAILED);
  }, [batch, until, onReady, onError]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{label}</h2>
      <ProgressBar processed={progress.processed} total={progress.total} />
      <p className="text-xs text-muted-foreground">{IMP.importing}</p>
    </section>
  );
}
