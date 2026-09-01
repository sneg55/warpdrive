"use client";

import type React from "react";
import { Button } from "@/components/ui/Button";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";

const S = ENRICHMENT_STRINGS.prospects;

export function ProspectResumeBanner({
  count,
  onOpen,
  onDismiss,
}: {
  count: number;
  onOpen: () => void;
  onDismiss: () => void;
}): React.ReactNode {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="text-foreground text-sm">{S.resumeBanner(count)}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onOpen}>
          {S.resumeOpen}
        </Button>
        <Button variant="outline" size="sm" onClick={onDismiss}>
          {S.resumeDismiss}
        </Button>
      </div>
    </div>
  );
}
