"use client";
import { memo, useCallback, useRef, useState } from "react";
import { layoutTimed, splitAllDay } from "@/features/activities/agendaLayout";
import { DEFAULT_START_HOUR } from "@/features/activities/agendaScroll";
import type { CalendarActivity } from "@/features/activities/calendar";
import { HOUR_HEIGHT_PX, HOURS, hourLabel } from "@/features/activities/weekAgenda";
import { cn } from "@/lib/utils";
import { ActivityChip } from "./calendarChip";
import { MoreActivitiesChip } from "./MoreActivitiesChip";

const COLUMN_HEIGHT_PX = HOURS.length * HOUR_HEIGHT_PX;

const MORE_WIDTH_CLASS = "w-[min(max(30%,5rem),60%)]";
const CHIP_BESIDE_MORE_CLASS = "w-[calc(100%-min(max(30%,5rem),60%))]";

interface AgendaDayColumnProps {
  iso: string;
  dayLabel: string;
  items: CalendarActivity[];
  onOpenActivity: (activity: CalendarActivity) => void;
  onOpenSlot: (iso: string, hour: number) => void;
}

export const AgendaDayColumn = memo(function AgendaDayColumn({
  iso,
  dayLabel,
  items,
  onOpenActivity,
  onOpenSlot,
}: AgendaDayColumnProps): React.ReactNode {
  const { timed } = splitAllDay(items);
  const { placements, overflows } = layoutTimed(timed);
  const ref = useRef<HTMLDivElement>(null);
  const [focusHour, setFocusHour] = useState(DEFAULT_START_HOUR);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, hour: number) => {
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = Math.min(HOURS.length - 1, Math.max(0, hour + delta));
    setFocusHour(next);
    ref.current?.querySelector<HTMLButtonElement>(`[data-hour="${next}"]`)?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a calendar day column is not a form <fieldset>
    <div
      ref={ref}
      role="group"
      aria-label={dayLabel}
      className="relative border-l border-border"
      style={{ height: COLUMN_HEIGHT_PX }}
    >
      {placements.map(({ activity, topPx, heightPx, leftPct, widthPct, overflowing }) => (
        <div
          key={activity.id}
          className={cn(
            "absolute z-10 overflow-hidden px-px",
            overflowing && CHIP_BESIDE_MORE_CLASS,
          )}
          style={{
            top: topPx,
            height: Math.min(heightPx, COLUMN_HEIGHT_PX - topPx),
            left: overflowing ? 0 : `${leftPct}%`,
            width: overflowing ? undefined : `${widthPct}%`,
          }}
        >
          <ActivityChip a={activity} onOpen={onOpenActivity} className="h-full" />
        </div>
      ))}
      {overflows.map(({ activities, topPx, heightPx }) => (
        <div
          key={`more-${activities[0]?.id ?? topPx}`}
          className={cn("absolute right-0 z-10 overflow-hidden px-px", MORE_WIDTH_CLASS)}
          style={{
            top: topPx,
            height: Math.min(heightPx, COLUMN_HEIGHT_PX - topPx),
            pointerEvents: "none",
          }}
        >
          <MoreActivitiesChip activities={activities} onOpen={onOpenActivity} />
        </div>
      ))}
      {HOURS.map((hour) => (
        <button
          key={hour}
          type="button"
          data-hour={hour}
          tabIndex={hour === focusHour ? 0 : -1}
          aria-label={`Add activity on ${iso} at ${hourLabel(hour)}`}
          onClick={() => onOpenSlot(iso, hour)}
          onKeyDown={(e) => onKeyDown(e, hour)}
          className="absolute inset-x-0 border-t border-border/60 hover:bg-accent/30"
          style={{ top: hour * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
        />
      ))}
    </div>
  );
});
