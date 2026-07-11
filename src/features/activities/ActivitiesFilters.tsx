"use client";
import type React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { ActivityPresetChips } from "./ActivityPresetChips";
import { ActivityTypeTab } from "./ActivityTypeTab";
import { ALL_OWNERS_OPTION, DONE_FILTER_OPTIONS } from "./activityFilterOptions";
import type { ActivityListFilter } from "./schemas";

export interface ActivityTypeOption {
  key: string;
  name: string;
}

interface ActivitiesFiltersProps {
  filter: ActivityListFilter;
  onChange: (f: ActivityListFilter) => void;
  owners: ComboboxOption[];
  types: ActivityTypeOption[];
}

// Activities-list filter toolbar (Pipedrive parity): owner, completed state, a custom date
// range, and the activity-type tab strip. Extracted from ActivitiesTable to keep it under the
// project's file-size budget. Every change here re-derives the full ActivityListFilter and hands
// it to onChange, so the table (which owns the state and feeds it straight to listRows) re-queries
// server-side; there is no client-side re-filtering here or in the table.
export function ActivitiesFilters({
  filter,
  onChange,
  owners,
  types,
}: ActivitiesFiltersProps): React.ReactNode {
  function patch(next: Partial<ActivityListFilter>): void {
    onChange({ ...filter, ...next });
  }

  function selectType(tab: string | null): void {
    patch({ typeKey: tab });
  }

  return (
    <div className="flex flex-col gap-2">
      <ActivityPresetChips from={filter.from} to={filter.to} onApply={(range) => patch(range)} />
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
          onChange={(v) => patch({ done: v as ActivityListFilter["done"] })}
          options={DONE_FILTER_OPTIONS}
        />
        <DatePicker
          ariaLabel="From"
          value={filter.from}
          onChange={(v) => patch({ from: v })}
          placeholder="From"
        />
        <DatePicker
          ariaLabel="To"
          value={filter.to}
          onChange={(v) => patch({ to: v })}
          placeholder="To"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        <ActivityTypeTab active={filter.typeKey} value={null} label="All" onSelect={selectType} />
        {types.map((t) => (
          <ActivityTypeTab
            key={t.key}
            active={filter.typeKey}
            value={t.key}
            label={t.name}
            icon
            onSelect={selectType}
          />
        ))}
      </div>
    </div>
  );
}
