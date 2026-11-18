"use client";

import type React from "react";
import { useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import type { YmdRange } from "@/components/ui/rangePresets";
import { Select } from "@/components/ui/Select";
import { STRINGS } from "@/constants/strings";
import { browserTimeZone } from "@/lib/browserTimeZone";
import { trpc } from "@/lib/trpc-client";
import type { OwnerScope } from "@/types/stats";
import { ActivityTypesWidget, LostReasonsWidget } from "./Breakdowns";
import { GoalsWidget } from "./GoalsWidget";
import { OwnerScopeSelect } from "./OwnerScopeSelect";
import { Scoreboard } from "./Scoreboard";
import { WonTrendWidget } from "./TrendWidget";
import { ActivitiesWidget, DealPerformanceWidget, FunnelWidget, StageSumsWidget } from "./widgets";

function currentYearRange(): { from: string; to: string } {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

const ALL_PIPELINES = "all";

const ME_SCOPE: OwnerScope = { kind: "me" };

interface DashboardProps {
  canViewOthers: boolean;
  canManageGoals?: boolean;
  today: string;
  currency: string;
  defaultPipelineId?: string | null;
}

export function Dashboard({
  canViewOthers,
  canManageGoals = false,
  currency,
  today,
}: DashboardProps) {
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(ME_SCOPE);
  const initial = currentYearRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const setRange = (range: YmdRange): void => {
    setFrom(range.from);
    setTo(range.to);
  };
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(ALL_PIPELINES);

  const pipelinesQ = trpc.pipeline.list.useQuery();
  const pipelines = pipelinesQ.data ?? [];
  const pipelineOptions = [
    { value: ALL_PIPELINES, label: STRINGS.dashboard.allPipelines },
    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
  ];

  const pipelineId = selectedPipelineId === ALL_PIPELINES ? null : selectedPipelineId;

  const ownerOptionsQ = trpc.stats.ownerOptions.useQuery(undefined, { enabled: canViewOthers });
  const goalsQ = trpc.goals.list.useQuery({ on: today, ownerScope });

  const data = trpc.stats.dashboard.useQuery({
    pipelineId,
    ownerScope,
    from,
    to,
    timeZone: browserTimeZone(),
  });

  const result = !data.isLoading && !data.isError ? data.data : undefined;

  let body: React.ReactNode;
  if (data.isLoading) {
    body = <p>{STRINGS.dashboard.loading}</p>;
  } else if (data.isError) {
    body = <p className="text-muted-foreground">{STRINGS.dashboard.statsUnavailable}</p>;
  } else if (result === undefined) {
    body = <p>{STRINGS.dashboard.loading}</p>;
  } else {
    body = (
      <div className="space-y-4">
        <Scoreboard
          deals={result.dealPerformance}
          won={result.wonDealStats}
          activities={result.activities}
          winRate={result.winRate}
          currency={currency}
          drillDown={{ owner: result.effectiveOwnerScope, pipelineId, from, to }}
        />
        <GoalsWidget data={goalsQ.data ?? []} currency={currency} canManage={canManageGoals} />
        <WonTrendWidget data={result.wonTrend} currency={currency} />
        <div className="grid gap-4 md:grid-cols-2">
          <DealPerformanceWidget data={result.dealPerformance} currency={currency} />
          <FunnelWidget data={result.funnel} ownerScope={result.effectiveOwnerScope} />
          <ActivitiesWidget data={result.activities} />
          <StageSumsWidget data={result.stageSums} currency={currency} />
          <ActivityTypesWidget data={result.activitiesByType} />
          <LostReasonsWidget data={result.lostReasons} currency={currency} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-balance text-display font-[450] leading-tight tracking-tight">
          {STRINGS.dashboard.title}
        </h1>
        <OwnerScopeSelect
          value={result?.effectiveOwnerScope ?? ownerScope}
          onChange={setOwnerScope}
          canViewOthers={canViewOthers}
          users={ownerOptionsQ.data?.users ?? []}
          teams={ownerOptionsQ.data?.teams ?? []}
        />
        <div className="flex items-center gap-2">
          <DatePicker
            ariaLabel={STRINGS.dashboard.rangeStartLabel}
            value={from}
            onChange={(v) => setFrom(v ?? initial.from)}
            onPresetRange={setRange}
          />
          <span aria-hidden="true">{STRINGS.dashboard.rangeSeparator}</span>
          <DatePicker
            ariaLabel={STRINGS.dashboard.rangeEndLabel}
            value={to}
            onChange={(v) => setTo(v ?? initial.to)}
            onPresetRange={setRange}
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
