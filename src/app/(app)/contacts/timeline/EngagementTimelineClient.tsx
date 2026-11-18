"use client";
import type React from "react";
import { useMemo, useState } from "react";
import { EngagementGridSkeleton } from "@/components/shell/skeletons";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { EngagementAxis } from "./EngagementAxis";
import { type EngagementFilter, EngagementFilters } from "./EngagementFilters";
import { EngagementLaneRow } from "./EngagementLaneRow";

const DEFAULT_FILTER: EngagementFilter = {
  entity: "person",
  monthsBack: 3,
  ownerId: null,
  typeKey: null,
};

const LOAD_ERROR = "Couldn't load the engagement timeline. Please try again.";

export function EngagementTimelineClient(): React.ReactNode {
  const [filter, setFilter] = useState<EngagementFilter>(DEFAULT_FILTER);
  const dataQ = trpc.contacts.engagementTimeline.useQuery(filter);
  const typesQ = trpc.activities.listTypes.useQuery();
  const ownersQ = trpc.identity.assignableUsers.useQuery();

  const owners = useMemo(
    () => (ownersQ.data ?? []).map((u) => ({ value: u.id, label: u.name })),
    [ownersQ.data],
  );
  const types = useMemo(
    () => (typesQ.data ?? []).map((t) => ({ key: t.key, name: t.name })),
    [typesQ.data],
  );

  const monthCount = Math.max(dataQ.data?.months.length ?? 0, 1);
  const tableMinWidth = 220 + monthCount * 200;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3">
      <EngagementFilters filter={filter} onChange={setFilter} owners={owners} types={types} />
      {dataQ.error !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {LOAD_ERROR}
        </p>
      ) : dataQ.isLoading || dataQ.data === undefined ? (
        <EngagementGridSkeleton />
      ) : dataQ.data.lanes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{STRINGS.contacts.timelineEmpty}</p>
      ) : (
        <section
          aria-label="Engagement timeline grid"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable data grid viewport
          tabIndex={0}
          className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border bg-card shadow-sm [scrollbar-gutter:stable]"
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: tableMinWidth }}
          >
            <colgroup>
              <col className="w-[220px]" />
              {dataQ.data.months.map((month) => (
                <col key={month} className="w-[200px]" />
              ))}
            </colgroup>
            <EngagementAxis months={dataQ.data.months} />
            <tbody>
              {dataQ.data.lanes.map((lane) => (
                <EngagementLaneRow
                  key={lane.contactId}
                  lane={lane}
                  months={dataQ.data.months}
                  entity={filter.entity}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
