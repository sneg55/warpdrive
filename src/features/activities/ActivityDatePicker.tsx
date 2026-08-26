"use client";
import type React from "react";
import { useMemo, useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import type { DayAccessory } from "@/components/ui/DayAccessoryButton";
import { parseYmd } from "@/components/ui/dateFormat";
import { ACTIVITY_LOAD_HINT, type ActivityLoadLevel } from "@/constants/activityLoad";
import { trpc } from "@/lib/trpc-client";
import { activityLoadLevel } from "./activityLoad";
import { addDaysUtc, monthGridRange } from "./monthGrid";

const DOT_CLASS: Record<Exclude<ActivityLoadLevel, "none">, string> = {
  light: "bg-emerald-500",
  near: "bg-amber-500",
  full: "bg-red-500",
};

const GRID_RANGE_SLACK_DAYS = 1;

function sameCalendarDayInUtc(localDay: Date): Date {
  return new Date(Date.UTC(localDay.getFullYear(), localDay.getMonth(), localDay.getDate()));
}

function rangeCoveringLocalDaysOfGrid(localMonth: Date): { from: Date; to: Date } {
  const grid = monthGridRange(sameCalendarDayInUtc(localMonth));
  return {
    from: addDaysUtc(grid.from, -GRID_RANGE_SLACK_DAYS),
    to: addDaysUtc(grid.to, GRID_RANGE_SLACK_DAYS),
  };
}

interface Props {
  value: string | null;
  onChange: (v: string | null) => void;
  ariaLabel: string;
  placeholder?: string;
  assigneeId?: string | null;
}

export function ActivityDatePicker({
  value,
  onChange,
  ariaLabel,
  placeholder,
  assigneeId = null,
}: Props): React.ReactNode {
  const valueKey = value ?? "";
  const selectedMonth = (value !== null ? parseYmd(value) : null) ?? new Date();
  const [navigated, setNavigated] = useState<{ month: Date; forValue: string } | null>(null);
  const navigationStillApplies = navigated !== null && navigated.forValue === valueKey;
  const month = navigationStillApplies ? navigated.month : selectedMonth;
  const range = useMemo(() => rangeCoveringLocalDaysOfGrid(month), [month]);
  const { data } = trpc.activities.dayLoad.useQuery({
    userId: assigneeId,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const dayAccessory = useMemo(() => {
    return (ymd: string): DayAccessory | null => {
      if (data === undefined) return null;
      const count = data.counts[ymd] ?? 0;
      const level = activityLoadLevel(count, data.target);
      if (level === "none") return null;
      return {
        indicator: <span className={`size-1.5 rounded-full ${DOT_CLASS[level]}`} />,
        hint: ACTIVITY_LOAD_HINT(count, data.target),
      };
    };
  }, [data]);

  return (
    <DatePicker
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      dayAccessory={dayAccessory}
      onMonthChange={(m) => setNavigated({ month: m, forValue: valueKey })}
      onOpenChange={(open) => {
        if (!open) setNavigated(null);
      }}
    />
  );
}
