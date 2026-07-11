"use client";
import type React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Select } from "@/components/ui/Select";
import { ActivityTypeTab } from "@/features/activities/ActivityTypeTab";
import { ALL_OWNERS_OPTION } from "@/features/activities/activityFilterOptions";
import type { ContactEntity } from "@/features/contacts/engagementTimeline";
import { cn } from "@/lib/utils";

export interface EngagementFilter {
  entity: ContactEntity;
  monthsBack: number;
  ownerId: string | null;
  typeKey: string | null;
}

export interface EngagementTypeOption {
  key: string;
  name: string;
}

// Period options mirror Pipedrive's "N months back" selector.
const PERIOD_OPTIONS = [
  { value: "3", label: "3 months back" },
  { value: "6", label: "6 months back" },
  { value: "12", label: "12 months back" },
];

const ENTITY_TABS: { value: ContactEntity; label: string }[] = [
  { value: "person", label: "People" },
  { value: "organization", label: "Organizations" },
];

interface EngagementFiltersProps {
  filter: EngagementFilter;
  onChange: (f: EngagementFilter) => void;
  owners: ComboboxOption[];
  types: EngagementTypeOption[];
}

// Toolbar for the engagement timeline: an entity (Person/Org) segmented toggle, a period select,
// an owner (assignee) combobox, and the shared activity-type chip row. Every change re-derives the
// full filter and hands it up; the client owns the state and re-queries server-side.
export function EngagementFilters({
  filter,
  onChange,
  owners,
  types,
}: EngagementFiltersProps): React.ReactNode {
  function patch(next: Partial<EngagementFilter>): void {
    onChange({ ...filter, ...next });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
          {ENTITY_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={filter.entity === t.value}
              onClick={() => patch({ entity: t.value })}
              className={cn(
                "rounded-sm px-2.5 py-1 transition-colors",
                filter.entity === t.value
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select
          ariaLabel="Period"
          value={String(filter.monthsBack)}
          onChange={(v) => patch({ monthsBack: Number(v) })}
          options={PERIOD_OPTIONS}
        />
        <Combobox
          ariaLabel="Owner"
          value={filter.ownerId ?? ""}
          onChange={(v) => patch({ ownerId: v === "" ? null : v })}
          options={[ALL_OWNERS_OPTION, ...owners]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        <ActivityTypeTab
          active={filter.typeKey}
          value={null}
          label="All"
          onSelect={(v) => patch({ typeKey: v })}
        />
        {types.map((t) => (
          <ActivityTypeTab
            key={t.key}
            active={filter.typeKey}
            value={t.key}
            label={t.name}
            icon
            onSelect={(v) => patch({ typeKey: v })}
          />
        ))}
      </div>
    </div>
  );
}
