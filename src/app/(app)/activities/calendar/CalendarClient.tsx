import Link from "next/link";
import type { CalendarActivity } from "@/features/activities/calendar";
import {
  type CalendarViewName,
  calendarHref,
  monthTitle,
  stepAnchorIso,
  weekTitle,
} from "@/features/activities/calendarView";
import { MonthView } from "./MonthView";
import { WeekAgendaGrid } from "./WeekAgendaGrid";

interface CalendarClientProps {
  view: CalendarViewName;
  anchorIso: string;
  dayIsos: string[];
  activities: CalendarActivity[];
  // Shown instead of the grid when the window holds nothing. The caller owns the wording because
  // only it knows whether a filter is doing the excluding, and an empty grid says nothing at all.
  empty?: React.ReactNode;
}

function tab(active: boolean): string {
  return active
    ? "px-3 py-1 text-sm rounded-sm bg-accent text-accent-foreground font-medium"
    : "px-3 py-1 text-sm rounded-sm text-muted-foreground hover:bg-accent/60";
}

export function CalendarClient({
  view,
  anchorIso,
  dayIsos,
  activities,
  empty,
}: CalendarClientProps): React.ReactNode {
  const prevIso = stepAnchorIso(view, anchorIso, -1);
  const nextIso = stepAnchorIso(view, anchorIso, 1);
  const todayIso = new Date().toISOString().slice(0, 10);
  const label =
    view === "month" ? monthTitle(anchorIso) : `Week of ${weekTitle(dayIsos[0] ?? anchorIso)}`;

  return (
    // Not <main>: the app shell already owns that landmark, and a second one inside it hides the
    // shell's from assistive tech instead of adding anything.
    <section aria-label="Calendar" className="p-4">
      <header className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          <Link
            aria-current={view === "week" ? "page" : undefined}
            href={calendarHref("week", anchorIso)}
            className={tab(view === "week")}
          >
            Week
          </Link>
          <Link
            aria-current={view === "month" ? "page" : undefined}
            href={calendarHref("month", anchorIso)}
            className={tab(view === "month")}
          >
            Month
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <Link
            aria-label="Previous"
            href={calendarHref(view, prevIso)}
            className="px-2 py-1 text-sm rounded border border-border hover:bg-accent/60"
          >
            {"<"}
          </Link>
          <Link
            href={calendarHref(view, todayIso)}
            className="px-2 py-1 text-sm rounded border border-border hover:bg-accent/60"
          >
            Today
          </Link>
          <Link
            aria-label="Next"
            href={calendarHref(view, nextIso)}
            className="px-2 py-1 text-sm rounded border border-border hover:bg-accent/60"
          >
            {">"}
          </Link>
        </div>
        {/* The heading for the window being shown; the page had no heading of any level under
            its h1 for a screen reader to move between. */}
        <h2 className="text-sm font-medium text-foreground tabular-nums">{label}</h2>
      </header>

      {empty !== undefined && activities.length === 0 ? (
        empty
      ) : view === "month" ? (
        <MonthView
          anchorIso={anchorIso}
          dayIsos={dayIsos}
          activities={activities}
          todayIso={todayIso}
        />
      ) : (
        <WeekAgendaGrid dayIsos={dayIsos} activities={activities} />
      )}
    </section>
  );
}
