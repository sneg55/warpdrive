import type { CalendarActivity } from "@/features/activities/calendar";
import { calendarActivityTarget } from "@/features/activities/calendarActivityTarget";

interface ActivityChipProps {
  a: CalendarActivity;
  onOpen?: (activity: CalendarActivity) => void;
  className?: string;
}

function ChipLabel({ a, parent }: { a: CalendarActivity; parent: string | null }): React.ReactNode {
  return (
    <span className="flex w-full min-w-0 items-baseline gap-1">
      <span className="truncate">{a.subject}</span>
      {parent !== null && (
        <span className="shrink-[4] truncate text-[11px] text-foreground/70">{parent}</span>
      )}
    </span>
  );
}

export function ActivityChip({ a, onOpen, className = "" }: ActivityChipProps): React.ReactNode {
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
