"use client";
import type React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Select } from "@/components/ui/Select";
import type { ActivityTypeOption } from "@/features/activities/ActivitiesFilters";
import { ActivityTypeTab } from "@/features/activities/ActivityTypeTab";
import {
  ALL_OWNERS_OPTION,
  DONE_FILTER_OPTIONS,
} from "@/features/activities/activityFilterOptions";
import type { CalendarFilterState } from "@/features/activities/calendarFilter";

// Calendar filter toolbar (AC1): owner (assignee) / status / type, the same three axes the list
// toolbar offers, minus the date range (the calendar view is the date window). Reuses the shared
// Combobox / Select / ActivityTypeTab primitives.
export function CalendarFilterBar({
  filter,
  onChange,
  owners,
  types,
}: {
  filter: CalendarFilterState;
  onChange: (f: CalendarFilterState) => void;
  owners: ComboboxOption[];
  types: ActivityTypeOption[];
}): React.ReactNode {
  function patch(next: Partial<CalendarFilterState>): void {
    onChange({ ...filter, ...next });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Combobox
          ariaLabel="Owner"
          value={filter.ownerId ?? ""}
          onChange={(v) => patch({ ownerId: v === "" ? null : v })}
          options={[ALL_OWNERS_OPTION, ...owners]}
        />
        <Select
          ariaLabel="Status"
          value={filter.done}
          onChange={(v) => patch({ done: v as CalendarFilterState["done"] })}
          options={DONE_FILTER_OPTIONS}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        <ActivityTypeTab
          active={filter.typeKey}
          value={null}
          label="All"
          onSelect={(tab) => patch({ typeKey: tab })}
        />
        {types.map((t) => (
          <ActivityTypeTab
            key={t.key}
            active={filter.typeKey}
            value={t.key}
            label={t.name}
            icon
            onSelect={(tab) => patch({ typeKey: tab })}
          />
        ))}
      </div>
    </div>
  );
}
