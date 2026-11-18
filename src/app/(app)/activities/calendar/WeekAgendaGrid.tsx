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

const NO_ITEMS: CalendarActivity[] = [];

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

  const grouped = useMemo(() => groupByLocalDay(activities, dayIsos, true), [activities, dayIsos]);
  const selected = activities.find((a) => a.id === selectedId) ?? null;
  const allDayRows = useMemo(() => allDayRowCount(grouped.values()), [grouped]);
  const todayIso = now === null ? null : localDayIso(now);
  const showNowLine = todayIso !== null && dayIsos.includes(todayIso);

  const weekKey = dayIsos.join(",");
  const anchoredWeek = useRef<string | null>(null);
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
