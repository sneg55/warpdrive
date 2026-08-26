import type { CalendarActivity } from "@/features/activities/calendar";
import { calendarActivityTarget } from "@/features/activities/calendarActivityTarget";

interface ActivityChipProps {
  a: CalendarActivity;
  // When provided (WeekAgendaGrid, an interactive client-rendered calendar grid), the chip hands
  // the whole activity back so the caller can route to its record. Omitted callers (MonthView's
  // static read-only cells) fall back to a plain deep link.
  onOpen?: (activity: CalendarActivity) => void;
  // Lets a caller size the chip to its container (the hour grid positions a block absolutely, and
  // any part of that block the chip does not fill swallows the click meant for the slot below).
  className?: string;
}

// Subject plus the record it hangs off. A week of "Email" chips is indistinguishable without the
// parent name, which is the one thing that says whose email it was.
function ChipLabel({ a, parent }: { a: CalendarActivity; parent: string | null }): React.ReactNode {
  return (
    <span className="flex w-full min-w-0 items-baseline gap-1">
      <span className="truncate">{a.subject}</span>
      {/* Shrinks faster than the subject: in a narrow lane the name gives up its room first,
          rather than both halves collapsing to three letters each. The colour is explicit rather
          than an opacity fade, which measured 3.93:1 here and 2.96:1 on the overdue tone. */}
      {parent !== null && (
        <span className="shrink-[4] truncate text-[11px] text-foreground/70">{parent}</span>
      )}
    </span>
  );
}

export function ActivityChip({ a, onOpen, className = "" }: ActivityChipProps): React.ReactNode {
  // The overdue pair is the app-wide red-50/red-700 convention (12+ sites) and clears AA at 5.9:1;
  // the neutral tone uses the shared tokens rather than the calendar's own gray scale. Red is the
  // one tone without a token, so it carries its own Night pair or the chip stays light on a dark
  // calendar.
  const tone = a.overdue
    ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200"
    : "bg-muted text-foreground";
  const target = calendarActivityTarget(a);
  const parent = target.kind === "record" ? target.preview.title : null;
  const label = <ChipLabel a={a} parent={parent} />;

  if (onOpen !== undefined) {
    return (
      <button
        type="button"
        data-type={a.typeKey}
        onClick={() => onOpen(a)}
        // items-start keeps the text at the top of a block sized to a whole meeting, rather than
        // floating in the middle of it the way a button centres its content by default.
        className={`flex w-full items-start truncate rounded px-1 my-0.5 text-left text-xs hover:underline ${tone} ${className}`}
      >
        {label}
      </button>
    );
  }
  return (
    <div
      data-type={a.typeKey}
      className={`text-xs rounded px-1 my-0.5 truncate ${tone} ${className}`}
    >
      {target.kind === "record" ? (
        <a href={target.href} className="hover:underline">
          {label}
        </a>
      ) : (
        label
      )}
    </div>
  );
}
