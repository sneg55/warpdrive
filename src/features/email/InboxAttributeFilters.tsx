"use client";
import type React from "react";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select, type SelectOption } from "@/components/ui/Select";
import { MAIL_LABELS } from "@/constants/email";
import { STRINGS } from "@/constants/strings";
import {
  type AttributeFilterState,
  type DateRangePreset,
  NO_ATTRIBUTE_FILTER,
} from "./threadAttributeFilter";

// Follow-up filter offers the actionable states only (waiting/replied/closed). "none"/unset is
// intentionally omitted: followUpStatus null (unset) is distinct from the explicit "none" value,
// so a single "None" filter option would be ambiguous. See implementation notes.
const FOLLOW_UP_FILTER_STATES = ["waiting", "replied", "closed"] as const;

// Toggle label + its accessible name paired with a labelled checkbox (design-system control).
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

// Surfaced inbox filters (IB1 + P2): follow-up status + label (single-select), attachment/unread
// toggles, a date-range preset, and a Clear reset. All shadcn primitives, no native controls.
export function InboxAttributeFilters({
  value,
  onChange,
}: {
  value: AttributeFilterState;
  onChange: (next: AttributeFilterState) => void;
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
      <Button variant="ghost" size="sm" onClick={() => onChange(NO_ATTRIBUTE_FILTER)}>
        {inbox.clearFilters}
      </Button>
    </div>
  );
}
