import { HOUR_HEIGHT_PX, HOURS, hourLabel } from "@/features/activities/weekAgenda";

export function TimeGutter(): React.ReactNode {
  return (
    <div
      aria-hidden
      className="relative border-r border-border bg-muted/40"
      style={{ height: HOURS.length * HOUR_HEIGHT_PX }}
    >
      {HOURS.slice(1).map((hour) => (
        <div
          key={hour}
          className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
          style={{ top: hour * HOUR_HEIGHT_PX }}
        >
          {hourLabel(hour)}
        </div>
      ))}
    </div>
  );
}
