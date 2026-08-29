"use client";
import type React from "react";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { cn } from "@/lib/utils";

const S = ENRICHMENT_STRINGS.dialog;

const SWEEP =
  "absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/85 to-transparent motion-reduce:animate-none dark:via-white/25";

const ROW_WIDTHS = ["w-3/4", "w-full", "w-1/2", "w-2/3"] as const;

const STAGGER_MS = 110;

function Bar({ className }: { className?: string }): React.ReactNode {
  return (
    <span
      className={cn("relative block overflow-hidden rounded bg-muted-foreground/15", className)}
    >
      <span data-testid="enrich-loading-sweep" aria-hidden="true" className={SWEEP} />
    </span>
  );
}

export function EnrichLoading(): React.ReactNode {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-1 [--enrich-stagger:0ms]"
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {S.loading}
        <span aria-hidden="true" className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{ animationDelay: `${i * 160}ms` }}
              className="size-1 animate-pulse rounded-full bg-muted-foreground/50 motion-reduce:animate-none"
            />
          ))}
        </span>
      </p>
      {ROW_WIDTHS.map((width, index) => (
        <div
          key={width}
          data-testid="enrich-loading-row"
          style={{ "--enrich-stagger": `${index * STAGGER_MS}ms` } as React.CSSProperties}
          className="grid animate-enrich-row-in grid-cols-[auto_8rem_1fr] items-center gap-x-3 py-2 opacity-0 motion-reduce:animate-none motion-reduce:opacity-100"
        >
          <Bar className="size-4 rounded-sm" />
          <Bar className="h-3.5" />
          <Bar className={cn("h-3.5", width)} />
        </div>
      ))}
    </div>
  );
}
