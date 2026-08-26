import { isoToDayHeading } from "@/features/activities/dayHeading";
import { cn } from "@/lib/utils";

// One day's column header. Today is called out the way MonthView calls out its today cell, so a
// week opened on the current week says which column the viewer is standing in.
export function AgendaDayHeader({ iso, today }: { iso: string; today: boolean }): React.ReactNode {
  return (
    <div
      data-today={today}
      className={cn(
        "border-l border-border px-2 py-1 text-xs font-medium tabular-nums",
        // bg-accent is a hair off white and read as no highlight at all; the link blue is the
        // colour this app already uses for "the one you are on".
        today ? "bg-link/10 font-semibold text-link" : "text-foreground",
      )}
    >
      {isoToDayHeading(iso)}
      {today && <span className="sr-only"> (today)</span>}
    </div>
  );
}
