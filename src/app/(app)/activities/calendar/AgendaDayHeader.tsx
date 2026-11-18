import { isoToDayHeading } from "@/features/activities/dayHeading";
import { cn } from "@/lib/utils";

export function AgendaDayHeader({ iso, today }: { iso: string; today: boolean }): React.ReactNode {
  return (
    <div
      data-today={today}
      className={cn(
        "border-l border-border px-2 py-1 text-xs font-medium tabular-nums",
        today ? "bg-link/10 font-semibold text-link" : "text-foreground",
      )}
    >
      {isoToDayHeading(iso)}
      {today && <span className="sr-only"> (today)</span>}
    </div>
  );
}
