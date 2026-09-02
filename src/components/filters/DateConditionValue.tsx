"use client";
import type React from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select, type SelectOption } from "@/components/ui/Select";
import { DATE_PRESET_KEYS, DATE_PRESET_LABELS, isDatePreset } from "@/constants/dateFilterPresets";

const EXACT_DATE = "exact";

const PERIOD_OPTIONS: SelectOption[] = [
  { value: EXACT_DATE, label: "Exact date" },
  ...DATE_PRESET_KEYS.map((key) => ({ value: key, label: DATE_PRESET_LABELS[key] })),
];

interface DateConditionValueProps {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
}

export function DateConditionValue({
  ariaLabel,
  value,
  onChange,
}: DateConditionValueProps): React.ReactNode {
  const preset = isDatePreset(value);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Select
        ariaLabel={`${ariaLabel} period`}
        value={preset ? value : EXACT_DATE}
        onChange={(v) => onChange(v === EXACT_DATE ? "" : v)}
        options={PERIOD_OPTIONS}
        triggerClassName="min-w-0 flex-1"
      />
      {preset ? null : (
        <div className="min-w-0 flex-1">
          <DatePicker
            ariaLabel={ariaLabel}
            value={value === "" ? null : value}
            onChange={(v) => onChange(v ?? "")}
            placeholder="Value"
            triggerClassName="w-full rounded-md border px-2 py-1 text-left text-sm hover:bg-accent"
          />
        </div>
      )}
    </div>
  );
}
