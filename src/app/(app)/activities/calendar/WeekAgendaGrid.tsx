"use client";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityEditModal, type EditableActivity } from "@/features/activities/ActivityEditModal";
import { AddActivityModal } from "@/features/activities/AddActivityModal";
import { allDayRowCount } from "@/features/activities/agendaLayout";
import { initialScrollHour } from "@/features/activities/agendaScroll";
import type { CalendarActivity } from "@/features/activities/calendar";
import { calendarActivityTarget } from "@/features/activities/calendarActivityTarget";
import { isoToDayLabel } from "@/features/activities/dayHeading";
import { followUpLinksOf, useFollowUpAfterDone } from "@/features/activities/followUpAfterDone";
import { useLocalNow } from "@/features/activities/useLocalNow";
import {
  AGENDA_GRID_COLS,
  groupByLocalDay,
  HOUR_HEIGHT_PX,
  localDayIso,
  slotDateTime,
} from "@/features/activities/weekAgenda";
import { useRecordPreview } from "@/features/navigation/recordPreviewStore";
import { trpc } from "@/lib/trpc-client";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import { AgendaDayColumn } from "./AgendaDayColumn";
import { AgendaDayHeader } from "./AgendaDayHeader";
import { AllDayLane } from "./AllDayLane";
import { NowLine } from "./NowLine";
import { TimeGutter } from "./TimeGutter";

interface CreateSlot {
  date: string;
  time: string;
}

// Stable identity so a day with nothing on it does not defeat AgendaDayColumn's memo.
const NO_ITEMS: CalendarActivity[] = [];

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
    allDay: a.allDay,
    durationMinutes: a.durationMinutes,
    location: a.location ?? null,
    done: a.done,
    assigneeId: a.assigneeId ?? null,
  };
}

// Interactive hourly week agenda: a time gutter plus seven day columns, sharing one set of grid
// tracks across a pinned header row, a pinned all-day row, and a scrolling hour region. Clicking a
// chip opens the record the activity hangs off; clicking an empty hour lane opens AddActivityModal
// prefilled with that day + hour. The standalone calendar has no deal/lead context, so a created
// activity gets no dealId/leadId, matching the "None" parent option other composers support.
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

  const setPreview = useRecordPreview((s) => s.setPreview);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createSlot, setCreateSlot] = useState<CreateSlot | null>(null);
  const promptAfterDone = useFollowUpAfterDone();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);
  const now = useLocalNow();

  // Bucket by LOCAL day (not weekGrid's UTC isoDay): this grid is client-rendered and its hour
  // lane (placeBlock) already reads local hours, so the day bucket must agree with that same local
  // frame or an activity near local midnight lands in the wrong column (see weekAgenda.test.ts's
  // "under a non-UTC timezone" regression). includeOverdue: an incomplete activity due in a past
  // navigated week must still render on its due day, not vanish; there is no separate overdue rail.
  const grouped = useMemo(() => groupByLocalDay(activities, dayIsos, true), [activities, dayIsos]);
  const selected = activities.find((a) => a.id === selectedId) ?? null;
  // One lane height for the whole week: a lane sized per column would push only some days' hour
  // grids down, and the same hour would sit at a different height in each column.
  const allDayRows = useMemo(() => allDayRowCount(grouped.values()), [grouped]);
  const todayIso = now === null ? null : localDayIso(now);
  const showNowLine = todayIso !== null && dayIsos.includes(todayIso);

  // Park the scroll on the working day. Left at the top, a 24-hour column opens on an empty
  // midnight and every real activity sits below the fold. Once per displayed week, not per data
  // change: saving an activity calls router.refresh(), and re-anchoring on that would yank the
  // viewer away from the slot they were just working in. Anchored on the RENDERED activities,
  // because calendarRange pads the fetched range by a day either side and groupByLocalDay drops
  // those rows, so one of them must not pull the view to an hour with nothing in it.
  const weekKey = dayIsos.join(",");
  const anchoredWeek = useRef<string | null>(null);
  // Before paint, not after: a passive effect leaves scrollTop at zero through the first frame, so
  // the viewer sees the empty top of the grid and then a jump. offsetTop, because the pinned rows
  // sit in the same scrolled content and take the first stretch of it.
  useIsomorphicLayoutEffect(() => {
    const el = scrollRef.current;
    const hours = hoursRef.current;
    if (el === null || hours === null || anchoredWeek.current === weekKey) return;
    anchoredWeek.current = weekKey;
    el.scrollTop =
      hours.offsetTop + initialScrollHour([...grouped.values()].flat()) * HOUR_HEIGHT_PX;
  }, [weekKey, grouped]);

  function refresh(): void {
    router.refresh();
  }

  // Same rule as the Activities list: a chip is a pointer at the work, so it opens the record the
  // activity hangs off. Only an activity linked to nothing has its own editor left to show.
  const openActivity = useCallback(
    (a: CalendarActivity) => {
      const target = calendarActivityTarget(a);
      if (target.kind === "edit") {
        setSelectedId(a.id);
        return;
      }
      setPreview(target.preview);
      router.push(target.href);
    },
    [router, setPreview],
  );

  const openSlot = useCallback((iso: string, hour: number) => {
    setCreateSlot(slotDateTime(iso, hour));
  }, []);

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {/* Headers, all-day lane and hour grid share ONE scroll box. Split across two, the scrolling
            half loses the scrollbar's width wherever scrollbars are not overlays, and the same
            gridTemplateColumns then resolves against two different widths: the columns stop lining
            up with their own headings. Sticky keeps the pinned rows visible without that. */}
        {/* relative so the hour grid's offsetTop measures from this box, which is what the scroll
            anchor adds to the target hour to clear the pinned rows above it. */}
        <div ref={scrollRef} data-agenda-scroll className="relative max-h-[60vh] overflow-y-auto">
          <div className="sticky top-0 z-30 bg-card">
            <div
              className="grid border-b border-border"
              style={{ gridTemplateColumns: AGENDA_GRID_COLS }}
            >
              <div className="bg-muted/40" />
              {dayIsos.map((iso) => (
                <AgendaDayHeader key={iso} iso={iso} today={iso === todayIso} />
              ))}
            </div>

            {allDayRows > 0 && (
              <div
                className="grid border-b border-border"
                style={{ gridTemplateColumns: AGENDA_GRID_COLS }}
              >
                <div className="bg-muted/40 px-1.5 py-1 text-right text-[10px] text-muted-foreground">
                  All day
                </div>
                {dayIsos.map((iso) => (
                  <AllDayLane
                    key={iso}
                    dayLabel={isoToDayLabel(iso)}
                    items={grouped.get(iso) ?? NO_ITEMS}
                    rows={allDayRows}
                    onOpenActivity={openActivity}
                  />
                ))}
              </div>
            )}
          </div>

          <div
            ref={hoursRef}
            className="relative grid"
            style={{ gridTemplateColumns: AGENDA_GRID_COLS }}
          >
            <TimeGutter />
            {dayIsos.map((iso) => (
              <AgendaDayColumn
                key={iso}
                iso={iso}
                dayLabel={isoToDayLabel(iso)}
                items={grouped.get(iso) ?? NO_ITEMS}
                onOpenActivity={openActivity}
                onOpenSlot={openSlot}
              />
            ))}
            {showNowLine && now !== null && <NowLine now={now} />}
          </div>
        </div>
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
          onMarkedDone={(activityId) => {
            if (activityId !== selected.id) return;
            if (promptAfterDone(followUpLinksOf(selected), refresh)) setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
