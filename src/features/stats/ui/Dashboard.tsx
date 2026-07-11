"use client";

import type React from "react";
import { useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { ActivitiesWidget, DealPerformanceWidget, FunnelWidget, StageSumsWidget } from "./widgets";

// Date range default: current calendar year, computed at render time so it stays valid.
function currentYearRange(): { from: string; to: string } {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

// Sentinel Select value for the "All pipelines" option. A real pipeline id is a
// uuid, so this never collides. It maps to a null pipelineId, which the stats
// router aggregates across every visible pipeline (STATS-08).
const ALL_PIPELINES = "all";

interface DashboardProps {
  canViewOthers: boolean;
  currency: string;
  // Retained for API stability with the page that renders this component. The
  // dashboard now defaults to "All pipelines" (STATS-08) instead of preselecting
  // a single default pipeline, so this is no longer read.
  defaultPipelineId?: string | null;
}

export function Dashboard({ canViewOthers, currency }: DashboardProps) {
  const [ownerScope, setOwnerScope] = useState<"me" | "all">("me");
  const initial = currentYearRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  // Default to "All pipelines" (STATS-08). The user can rescope to a specific
  // pipeline and back to all without reloading.
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(ALL_PIPELINES);

  const pipelinesQ = trpc.pipeline.list.useQuery();
  const pipelines = pipelinesQ.data ?? [];
  // "All pipelines" is the first option and the default selection.
  const pipelineOptions = [
    { value: ALL_PIPELINES, label: STRINGS.dashboard.allPipelines },
    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
  ];

  // ALL_PIPELINES => null pipelineId (aggregate across all visible pipelines).
  const pipelineId = selectedPipelineId === ALL_PIPELINES ? null : selectedPipelineId;

  const data = trpc.stats.dashboard.useQuery({
    pipelineId,
    ownerScope,
    from,
    to,
  });

  // Resolved only once loading/error have cleared, so the toolbar (title, owner
  // toggle, date-range pickers) can render unconditionally below regardless of
  // query state; only the widget area depends on `result`.
  const result = !data.isLoading && !data.isError ? data.data : undefined;

  let body: React.ReactNode;
  if (data.isLoading) {
    body = <p>{STRINGS.dashboard.loading}</p>;
  } else if (data.isError) {
    // The only reachable dashboard error is E_STATS_001 (a specific pipeline not visible, e.g. a
    // stale selection). "All pipelines" no longer errors on a missing default (STATS-08).
    body = <p className="text-muted-foreground">{STRINGS.dashboard.statsUnavailable}</p>;
  } else if (result === undefined) {
    // Brief window between isLoading=false and data arrival (e.g. background refetch).
    body = <p>{STRINGS.dashboard.loading}</p>;
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        <DealPerformanceWidget data={result.dealPerformance} currency={currency} />
        <FunnelWidget data={result.funnel} />
        <ActivitiesWidget data={result.activities} />
        <StageSumsWidget data={result.stageSums} currency={currency} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-balance text-lg font-medium">{STRINGS.dashboard.title}</h1>
        <button
          type="button"
          disabled={!canViewOthers}
          onClick={() => {
            setOwnerScope((s) => (s === "me" ? "all" : "me"));
          }}
          className="rounded border px-2 py-1 text-sm transition-transform active:scale-[0.96] disabled:opacity-50"
          title={
            canViewOthers
              ? STRINGS.dashboard.ownerToggleTitle
              : STRINGS.dashboard.ownerToggleDisabledTitle
          }
        >
          {STRINGS.dashboard.ownerToggleLabel}{" "}
          {(result?.effectiveOwnerScope ?? ownerScope) === "all"
            ? STRINGS.dashboard.ownerAll
            : STRINGS.dashboard.ownerMe}
        </button>
        <div className="flex items-center gap-2">
          <DatePicker
            ariaLabel={STRINGS.dashboard.rangeStartLabel}
            value={from}
            onChange={(v) => setFrom(v ?? initial.from)}
          />
          <span aria-hidden="true">{STRINGS.dashboard.rangeSeparator}</span>
          <DatePicker
            ariaLabel={STRINGS.dashboard.rangeEndLabel}
            value={to}
            onChange={(v) => setTo(v ?? initial.to)}
          />
        </div>
        <Select
          ariaLabel={STRINGS.dashboard.pipelineLabel}
          value={selectedPipelineId}
          onChange={(v) => setSelectedPipelineId(v)}
          options={pipelineOptions}
        />
      </div>
      {body}
    </div>
  );
}
