import type { CalendarActivity } from "@/features/activities/calendar";
import { anchorDate, calendarHref } from "@/features/activities/calendarView";
import { groupMonthActivities, isSameMonth } from "@/features/activities/monthGrid";
import { ActivityChip } from "./calendarChip";

// The month display is the WAI-ARIA grid pattern (role=grid > row > columnheader/gridcell),
// the correct semantics for a calendar date grid. Biome's a11y rules assume any grid role is
// an interactive widget needing focus management and a semantic <table>; this is a static,
// read-only display, so those specific rules are suppressed per element below.

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MAX_CHIPS = 3;
const WEEK_ROWS = [0, 1, 2, 3, 4, 5] as const;

function DayCell({
  iso,
  anchor,
  items,
  todayIso,
}: {
  iso: string;
  anchor: Date;
  items: CalendarActivity[];
  todayIso: string;
}): React.ReactNode {
  const day = new Date(`${iso}T00:00:00.000Z`);
  const adjacent = !isSameMonth(day, anchor);
  const isToday = iso === todayIso;
  const cellTone = adjacent ? "bg-gray-50 text-gray-400" : "";
  const todayRing = isToday ? "ring-1 ring-primary" : "";
  const overflow = items.length - MAX_CHIPS;
  return (
    // biome-ignore lint/a11y/useSemanticElements: calendar day cell, not a <td>
    // biome-ignore lint/a11y/useFocusableInteractive: static read-only calendar grid
    <div
      role="gridcell"
      data-testid={`cell-${iso}`}
      data-adjacent={adjacent}
      data-today={isToday}
      className={`border border-gray-200 rounded-md p-1 min-h-24 ${cellTone} ${todayRing}`}
    >
      <a
        href={calendarHref("week", iso)}
        className="block text-xs font-medium hover:underline mb-0.5 tabular-nums"
      >
        {day.getUTCDate()}
      </a>
      {items.slice(0, MAX_CHIPS).map((a) => (
        <ActivityChip key={a.id} a={a} />
      ))}
      {overflow > 0 ? (
        <a
          href={calendarHref("week", iso)}
          className="block text-xs text-primary hover:underline mt-0.5 tabular-nums"
        >
          +{overflow} more
        </a>
      ) : null}
    </div>
  );
}

export function MonthView({
  anchorIso,
  dayIsos,
  activities,
  todayIso,
}: {
  anchorIso: string;
  dayIsos: string[];
  activities: CalendarActivity[];
  todayIso: string;
}): React.ReactNode {
  const anchor = anchorDate(anchorIso);
  const days = dayIsos.map((iso) => new Date(`${iso}T00:00:00.000Z`));
  const grouped = groupMonthActivities(activities, days);

  return (
    // biome-ignore lint/a11y/useSemanticElements: static calendar grid, not a data <table>
    <div role="grid" aria-label="Month" className="flex flex-col gap-1">
      {/* biome-ignore lint/a11y/useSemanticElements: header row of the calendar grid */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: static read-only calendar grid */}
      <div role="row" className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w) => (
          // biome-ignore lint/a11y/useSemanticElements: weekday column header in the grid
          // biome-ignore lint/a11y/useFocusableInteractive: static read-only calendar grid
          <div key={w} role="columnheader" className="text-xs font-medium text-gray-500 px-1">
            {w}
          </div>
        ))}
      </div>
      {WEEK_ROWS.map((week) => (
        // biome-ignore lint/a11y/useSemanticElements: week row of the calendar grid
        // biome-ignore lint/a11y/useFocusableInteractive: static read-only calendar grid
        <div key={week} role="row" className="grid grid-cols-7 gap-1">
          {dayIsos.slice(week * 7, week * 7 + 7).map((iso) => (
            <DayCell
              key={iso}
              iso={iso}
              anchor={anchor}
              items={grouped.get(iso) ?? []}
              todayIso={todayIso}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
