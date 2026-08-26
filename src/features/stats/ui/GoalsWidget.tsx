"use client";
import Link from "next/link";
import type React from "react";
import { buttonVariants } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { STRINGS } from "@/constants/strings";
import { goalLabel } from "@/features/goals/goalLabel";
import type { GoalWithProgress } from "@/features/goals/router";
import { Bar, money, Panel } from "./Panel";

function paceTone(pace: number | null): string {
  if (pace === null) return "text-muted-foreground";
  return pace >= 1 ? "text-emerald-600" : "text-destructive";
}

function GoalRow({ row, currency }: { row: GoalWithProgress; currency: string }): React.ReactNode {
  const { goal, progress } = row;
  const label = goalLabel(goal);
  const isValue = goal.metric === "value";
  const fmt = (v: string) => (isValue ? money(v, currency) : v);

  if (progress === null) {
    return (
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="truncate">{label}</span>
          <span className="text-muted-foreground">{STRINGS.dashboard.goalNotStarted}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-sm">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {fmt(progress.actual)} / {fmt(progress.target)}
        </span>
      </div>
      <Bar label={label} pct={(progress.attainment ?? 0) * 100} />
      <p className="mt-0.5 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          {progress.periodStart} {STRINGS.dashboard.rangeSeparator} {progress.periodEnd}
        </span>
        {progress.pace !== null && (
          <span className={paceTone(progress.pace)}>
            {STRINGS.dashboard.goalPace} {Math.round(progress.pace * 100)}%
          </span>
        )}
      </p>
    </div>
  );
}

export function GoalsWidget({
  data,
  currency,
  canManage,
}: {
  data: GoalWithProgress[];
  currency: string;
  canManage: boolean;
}): React.ReactNode {
  if (data.length === 0) {
    return (
      <Panel title={STRINGS.dashboard.widgetGoals} isEmpty={false} emptyText="">
        <EmptyState
          title={STRINGS.dashboard.emptyGoals}
          body={STRINGS.dashboard.emptyGoalsBody}
          className="py-8"
          action={
            canManage ? (
              <Link href="/settings/goals" className={buttonVariants({ size: "sm" })}>
                {STRINGS.dashboard.goalsSettingsLink}
              </Link>
            ) : undefined
          }
        />
      </Panel>
    );
  }
  return (
    <Panel title={STRINGS.dashboard.widgetGoals} isEmpty={false} emptyText="">
      <div className="space-y-3">
        {data.map((row) => (
          <GoalRow key={row.goal.id} row={row} currency={currency} />
        ))}
        {canManage && (
          <Link
            href="/settings/goals"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            {STRINGS.dashboard.goalsSettingsLink}
          </Link>
        )}
      </div>
    </Panel>
  );
}
