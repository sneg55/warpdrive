"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActivityEditModal, type EditableActivity } from "@/features/activities/ActivityEditModal";
import { AddActivityModal } from "@/features/activities/AddActivityModal";
import type { CalendarActivity } from "@/features/activities/calendar";
import { groupByLocalDay, slotDateTime } from "@/features/activities/weekAgenda";
import { trpc } from "@/lib/trpc-client";
import { AgendaDayColumn } from "./AgendaDayColumn";

interface CreateSlot {
  date: string;
  time: string;
}

// Maps a calendar-view activity onto ActivityEditModal's field shape. CalendarActivity (from
// calendarRange) doesn't carry priority, and location is only populated by the deal-history
// projection, not the calendar one; both default to null here. That's safe by the same rule
// ActivitiesTable's toEditable relies on: Save only ships fields the user actually touched
// (see buildActivityPatch), so an unseen existing value is never clobbered.
function toEditable(a: CalendarActivity, typeIdByKey: Map<string, string>): EditableActivity {
  return {
    id: a.id,
    subject: a.subject,
    typeId: typeIdByKey.get(a.typeKey) ?? "",
    priority: null,
    dueAtIso: a.dueAt.toISOString(),
    durationMinutes: a.durationMinutes,
    location: a.location ?? null,
    done: a.done,
  };
}

// Interactive hourly week agenda: a 7-column grid of AgendaDayColumns. Clicking a placed
// activity chip opens ActivityEditModal; clicking an empty hour lane opens AddActivityModal
// prefilled with that day + hour. The standalone calendar has no deal/lead context, so a
// created activity gets no dealId/leadId, matching the "None" parent option other composers
// already support.
export function WeekAgendaGrid({
  dayIsos,
  activities,
}: {
  dayIsos: string[];
  activities: CalendarActivity[];
}): React.ReactNode {
  const router = useRouter();
  const typesQ = trpc.activities.listTypes.useQuery();
  const typeIdByKey = useMemo(
    () => new Map((typesQ.data ?? []).map((t) => [t.key, t.id])),
    [typesQ.data],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createSlot, setCreateSlot] = useState<CreateSlot | null>(null);

  // Bucket by LOCAL day (not weekGrid's UTC isoDay): this grid is client-rendered and its hour
  // lane (AgendaDayColumn -> placeBlock) already reads local hours, so the day bucket must agree
  // with that same local frame or an activity near local midnight lands in the wrong column
  // (see weekAgenda.test.ts's "under a non-UTC timezone" regression). includeOverdue: an
  // incomplete activity due in a past navigated week must still render on its due day, not
  // vanish; there is no separate overdue rail in this navigable calendar.
  const grouped = useMemo(() => groupByLocalDay(activities, dayIsos, true), [activities, dayIsos]);
  const selected = activities.find((a) => a.id === selectedId) ?? null;

  function refresh(): void {
    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {dayIsos.map((iso) => (
          <AgendaDayColumn
            key={iso}
            iso={iso}
            items={grouped.get(iso) ?? []}
            onOpenActivity={setSelectedId}
            onOpenSlot={(hour) => setCreateSlot(slotDateTime(iso, hour))}
          />
        ))}
      </div>

      {createSlot !== null && (
        <AddActivityModal
          onClose={() => setCreateSlot(null)}
          onCreated={refresh}
          defaultDate={createSlot.date}
          defaultTime={createSlot.time}
        />
      )}

      {selected !== null && (
        <ActivityEditModal
          activity={toEditable(selected, typeIdByKey)}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
