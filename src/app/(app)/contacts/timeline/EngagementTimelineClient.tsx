"use client";
import type React from "react";
import { useMemo, useState } from "react";
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

// Per-contact engagement timeline (CO-4): the Pipedrive-style "how recently have I engaged each
// contact" grid. Owns the filter state and re-queries contacts.engagementTimeline server-side on
// every change (entity/period/owner/type); there is no client-side re-filtering.
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

  // Grid: a fixed 220px contact column, then an equal-width column per month.
  const gridTemplate = `220px repeat(${Math.max(dataQ.data?.months.length ?? 0, 1)}, minmax(90px, 1fr))`;

  return (
    <div className="flex flex-col gap-3">
      <EngagementFilters filter={filter} onChange={setFilter} owners={owners} types={types} />
      {dataQ.error !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {LOAD_ERROR}
        </p>
      ) : dataQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : dataQ.data === undefined || dataQ.data.lanes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{STRINGS.contacts.timelineEmpty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <div className="grid min-w-max" style={{ gridTemplateColumns: gridTemplate }}>
            <EngagementAxis months={dataQ.data.months} />
            {dataQ.data.lanes.map((lane) => (
              <EngagementLaneRow
                key={lane.contactId}
                lane={lane}
                months={dataQ.data.months}
                entity={filter.entity}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
