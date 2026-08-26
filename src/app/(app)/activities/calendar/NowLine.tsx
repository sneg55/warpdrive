import { AGENDA_GUTTER_WIDTH, HOUR_HEIGHT_PX } from "@/features/activities/weekAgenda";

// The current-time rule, drawn across the week the way every calendar draws it. Rendered only when
// today falls inside the displayed week; WeekAgendaGrid owns that check.
export function NowLine({ now }: { now: Date }): React.ReactNode {
  const topPx = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT_PX;
  return (
    <div
      aria-hidden
      data-now-line
      className="pointer-events-none absolute z-20 flex items-center"
      style={{ top: topPx, left: `calc(${AGENDA_GUTTER_WIDTH} - 0.25rem)`, right: 0 }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
      <span className="h-px w-full bg-destructive" />
    </div>
  );
}
