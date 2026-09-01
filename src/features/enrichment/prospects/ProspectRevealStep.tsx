"use client";

import type React from "react";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { RevealQueueStatus } from "./useRevealQueue";

const S = ENRICHMENT_STRINGS.prospects;

function percent(processed: number, total: number): number {
  return total === 0 ? 0 : Math.round((processed / total) * 100);
}

export function ProspectRevealStep({
  status,
  processed,
  total,
  stopping,
  failures,
  error,
  onStop,
}: {
  status: RevealQueueStatus;
  processed: number;
  total: number;
  stopping: boolean;
  failures: number;
  error: string | null;
  onStop: () => void;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground text-sm">{S.revealProgress(processed, total)}</span>
        {status === "running" ? (
          <Button variant="outline" size="sm" disabled={stopping} onClick={onStop}>
            {stopping ? S.revealStopping : S.revealStop}
          </Button>
        ) : null}
      </div>
      <Progress value={percent(processed, total)} label={S.revealProgress(processed, total)} />
      {status === "aborted" ? (
        <span className="text-muted-foreground text-xs">{S.revealStopped(processed)}</span>
      ) : null}
      {failures > 0 ? (
        <span className="text-muted-foreground text-xs">{S.revealFailures(failures)}</span>
      ) : null}
      {status === "error" ? (
        <span className="text-destructive text-xs">
          {error === null ? S.revealFailed : `${S.revealFailed} ${error}`}
        </span>
      ) : null}
    </div>
  );
}
