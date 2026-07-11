import { redirect } from "next/navigation";
import { STRINGS } from "@/constants/strings";
import { calendarRange } from "@/features/activities/calendar";
import { parseCalendarParams, selectWindow } from "@/features/activities/calendarView";
import { createContext } from "@/server/trpc/context";
import { ActivitiesToggle } from "../ActivitiesToggle";
import { FilterableCalendar } from "./FilterableCalendar";

export const metadata = { title: STRINGS.titles.calendar };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }

  const sp = await searchParams;
  const { view, anchorIso } = parseCalendarParams({
    view: typeof sp.view === "string" ? sp.view : undefined,
    d: typeof sp.d === "string" ? sp.d : undefined,
  });
  const { days, range } = selectWindow(view, anchorIso);
  const activities = await calendarRange(ctx.db, ctx.actor, range, AbortSignal.timeout(10_000));

  return (
    <div className="p-4">
      <ActivitiesToggle active="calendar" />
      <FilterableCalendar
        view={view}
        anchorIso={anchorIso}
        dayIsos={days.map((d) => d.toISOString().slice(0, 10))}
        activities={activities}
      />
    </div>
  );
}
