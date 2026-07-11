"use client";
import type React from "react";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./Button";
import { formatMdy, parseYmd, toYmd } from "./dateFormat";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

// react-day-picker v10's captionLayout="dropdown" defaults navEnd to Dec 31
// of the current year when startMonth/endMonth are omitted, which caps the
// next-month chevron and year dropdown there and makes any future date
// unreachable. These bound the navigable range explicitly instead: far
// enough back for historical deal/lead dates, far enough forward that the
// year dropdown parity feature (Pipedrive) stays usable for years to come.
const DATE_PICKER_PAST_YEARS = 100;
const DATE_PICKER_FUTURE_YEARS = 20;

interface DatePickerProps {
  value: string | null;
  onChange: (v: string | null) => void;
  ariaLabel: string;
  placeholder?: string;
  // Replaces the default bordered-button trigger styling (e.g. the deal Summary renders the
  // trigger as a plain text/CTA row, Pipedrive-style). Also applied to the empty-state
  // placeholder span so a CTA trigger can style "Set expected close date" as a link.
  triggerClassName?: string;
  placeholderClassName?: string;
  // Overrides the trigger's set-value text (default MM/DD/YYYY).
  formatLabel?: (ymd: string) => string;
  // Opens the calendar popover on mount (PD's inline date editor shows the calendar
  // immediately when the field enters edit mode).
  defaultOpen?: boolean;
}

// Popover + react-day-picker calendar. Value/onChange use local YYYY-MM-DD so
// this drops into the existing date inputs (composer, add-deal, add-lead) with
// no change to their action payloads; the trigger shows MM/DD/YYYY.
export function DatePicker({
  value,
  onChange,
  ariaLabel,
  placeholder = "Select date",
  triggerClassName,
  placeholderClassName,
  formatLabel,
  defaultOpen = false,
}: DatePickerProps): React.ReactNode {
  const [open, setOpen] = useState(defaultOpen);
  const selected = value !== null ? (parseYmd(value) ?? undefined) : undefined;
  const label = value !== null ? (formatLabel ?? formatMdy)(value) : "";
  const currentYear = new Date().getFullYear();
  const startMonth = new Date(currentYear - DATE_PICKER_PAST_YEARS, 0);
  const endMonth = new Date(currentYear + DATE_PICKER_FUTURE_YEARS, 11);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className={
          triggerClassName ?? cn(buttonVariants({ variant: "outline", size: "sm" }), "font-normal")
        }
      >
        {label === "" ? (
          <span className={placeholderClassName ?? "text-muted-foreground"}>{placeholder}</span>
        ) : (
          label
        )}
      </PopoverTrigger>
      <PopoverContent>
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(day) => {
            if (day !== undefined) {
              onChange(toYmd(day));
              setOpen(false);
            }
          }}
          captionLayout="dropdown"
          startMonth={startMonth}
          endMonth={endMonth}
        />
        <div className="flex justify-end border-t pt-1.5">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
