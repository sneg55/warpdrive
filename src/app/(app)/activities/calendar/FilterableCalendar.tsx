"use client";
import { useMemo, useState } from "react";
import type { CalendarActivity } from "@/features/activities/calendar";
import { filterCalendarActivities, NO_CALENDAR_FILTER } from "@/features/activities/calendarFilter";
import type { CalendarViewName } from "@/features/activities/calendarView";
import { trpc } from "@/lib/trpc-client";
import { CalendarClient } from "./CalendarClient";
import { CalendarFilterBar } from "./CalendarFilterBar";

// Client wrapper that adds owner/type/status filters (AC1) over the calendar. The full in-window
// activity set is fetched server-side (page.tsx); filtering happens client-side so switching a
// filter is instant and needs no re-query. Option metadata reuses the same tRPC queries the list
// toolbar uses.
export function FilterableCalendar({
  view,
  anchorIso,
  dayIsos,
  activities,
}: {
  view: CalendarViewName;
  anchorIso: string;
  dayIsos: string[];
  activities: CalendarActivity[];
}): React.ReactNode {
  const [filter, setFilter] = useState(NO_CALENDAR_FILTER);
  const typesQ = trpc.activities.listTypes.useQuery();
  const ownersQ = trpc.identity.assignableUsers.useQuery();

  const types = useMemo(
    () => (typesQ.data ?? []).map((t) => ({ key: t.key, name: t.name })),
    [typesQ.data],
  );
  const owners = useMemo(
    () =>
      (ownersQ.data ?? []).map((u) => ({
        value: u.id,
        label: u.name,
        avatarName: u.name,
        avatarUrl: u.avatarUrl,
      })),
    [ownersQ.data],
  );
  const filtered = useMemo(
    () => filterCalendarActivities(activities, filter),
    [activities, filter],
  );

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4">
        <CalendarFilterBar filter={filter} onChange={setFilter} owners={owners} types={types} />
      </div>
      <CalendarClient view={view} anchorIso={anchorIso} dayIsos={dayIsos} activities={filtered} />
    </div>
  );
}
