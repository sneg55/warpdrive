"use client";
import type React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { ActivityPresetChips } from "./ActivityPresetChips";
import { ActivityScopeChips } from "./ActivityScopeChips";
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
  pipelineName?: string | null;
}

export function ActivitiesFilters({
  filter,
  onChange,
  owners,
  types,
  pipelineName = null,
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
        {/* Both primitives default to w-full; with no width here each claims the whole flex line
            and wraps, so the pickers render full-bleed and stacked. */}
        <Combobox
          ariaLabel="Owner"
          triggerClassName="w-52"
          value={filter.ownerId ?? ""}
          onChange={(v) => patch({ ownerId: v === "" ? null : v })}
          options={[ALL_OWNERS_OPTION, ...owners]}
        />
        <Select
          ariaLabel="Status"
          triggerClassName="w-52"
          value={filter.done}
          onChange={(v) => patch({ done: v as ActivityListFilter["done"] })}
          options={DONE_FILTER_OPTIONS}
        />
        <DatePicker
          ariaLabel="From"
          value={filter.from}
          onChange={(v) => patch({ from: v })}
          onPresetRange={patch}
          placeholder="From"
        />
        <DatePicker
          ariaLabel="To"
          value={filter.to}
          onChange={(v) => patch({ to: v })}
          onPresetRange={patch}
          placeholder="To"
        />
        <ActivityScopeChips filter={filter} pipelineName={pipelineName} onChange={onChange} />
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
