"use client";
import type React from "react";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, type SelectOption } from "@/components/ui/Select";
import { MAIL_LABELS } from "@/constants/email";
import { STRINGS } from "@/constants/strings";
import type { InboxFilter } from "./emailReads";
import {
  type AttributeFilterState,
  type DateRangePreset,
  NO_ATTRIBUTE_FILTER,
} from "./threadAttributeFilter";

const FOLLOW_UP_FILTER_STATES = ["waiting", "replied", "closed"] as const;

const QUICK_FILTER_OPTIONS: { value: InboxFilter; label: string }[] = [
  { value: "shared", label: "Shared" },
  { value: "private", label: "Private" },
  { value: "tracked", label: "Tracked emails" },
  { value: "to_me", label: "To: me" },
  { value: "from_contact", label: "From an existing contact" },
  { value: "linked_open_deal", label: "Linked with an open deal" },
];
const QUICK_FILTER_TRIGGER = "More filters";
const QUICK_FILTER_NONE = "none";

function isQuickFilter(f: InboxFilter): boolean {
  return QUICK_FILTER_OPTIONS.some((o) => o.value === f);
}

function QuickFilterMenu({
  quickFilter,
  onQuickFilterChange,
}: {
  quickFilter: InboxFilter;
  onQuickFilterChange: (next: InboxFilter) => void;
}): React.ReactNode {
  const radioValue = isQuickFilter(quickFilter) ? quickFilter : QUICK_FILTER_NONE;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {QUICK_FILTER_TRIGGER}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{QUICK_FILTER_TRIGGER}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={radioValue}
          onValueChange={(v) =>
            onQuickFilterChange(v === QUICK_FILTER_NONE ? "all" : (v as InboxFilter))
          }
        >
          <DropdownMenuRadioItem value={QUICK_FILTER_NONE}>None</DropdownMenuRadioItem>
          {QUICK_FILTER_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.ReactNode {
  const id = useId();
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Checkbox id={id} label={label} checked={checked} onCheckedChange={onChange} />
      <label htmlFor={id}>{label}</label>
    </span>
  );
}

export function InboxAttributeFilters({
  value,
  onChange,
  quickFilter = "all",
  onQuickFilterChange = () => {},
}: {
  value: AttributeFilterState;
  onChange: (next: AttributeFilterState) => void;
  quickFilter?: InboxFilter;
  onQuickFilterChange?: (next: InboxFilter) => void;
}): React.ReactNode {
  const inbox = STRINGS.inbox;
  const statusNames = inbox.followUpStatusNames;
  const labelNames = inbox.labelNames;
  const followUpOptions: SelectOption[] = [
    { value: "", label: "All follow-ups" },
    ...FOLLOW_UP_FILTER_STATES.map((s) => ({ value: s, label: statusNames[s] })),
  ];
  const labelOptions: SelectOption[] = [
    { value: "", label: "All labels" },
    ...MAIL_LABELS.map((l) => ({ value: l, label: labelNames[l] })),
  ];
  const dateRangeOptions: SelectOption[] = [
    { value: "any", label: inbox.dateRangeAny },
    { value: "7d", label: inbox.dateRange7d },
    { value: "30d", label: inbox.dateRange30d },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        ariaLabel="Follow-up status filter"
        value={value.followUp}
        onChange={(followUp) => onChange({ ...value, followUp })}
        placeholder="Follow-up"
        options={followUpOptions}
        triggerClassName="w-auto"
      />
      <Select
        ariaLabel="Label filter"
        value={value.label}
        onChange={(label) => onChange({ ...value, label })}
        placeholder="Label"
        options={labelOptions}
        triggerClassName="w-auto"
      />
      <FilterToggle
        label={inbox.hasAttachmentLabel}
        checked={value.hasAttachment}
        onChange={(hasAttachment) => onChange({ ...value, hasAttachment })}
      />
      <FilterToggle
        label={inbox.unreadOnlyLabel}
        checked={value.unreadOnly}
        onChange={(unreadOnly) => onChange({ ...value, unreadOnly })}
      />
      <Select
        ariaLabel={inbox.dateRangeLabel}
        value={value.dateRange}
        onChange={(dateRange) => onChange({ ...value, dateRange: dateRange as DateRangePreset })}
        placeholder={inbox.dateRangeLabel}
        options={dateRangeOptions}
        triggerClassName="w-auto"
      />
      <QuickFilterMenu quickFilter={quickFilter} onQuickFilterChange={onQuickFilterChange} />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onChange(NO_ATTRIBUTE_FILTER);
          onQuickFilterChange("all");
        }}
      >
        {inbox.clearFilters}
      </Button>
    </div>
  );
}
