"use client";
import dynamic from "next/dynamic";
import type React from "react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./Button";
import { type DayAccessory, dayAccessoryButton } from "./DayAccessoryButton";
import { formatMdy, parseYmd, toYmd } from "./dateFormat";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { RangePresetRail } from "./RangePresetRail";
import type { YmdRange } from "./rangePresets";

const DayPicker = dynamic(async () => (await import("react-day-picker")).DayPicker, {
  ssr: false,
  loading: () => <div className="min-h-[18rem]" aria-hidden="true" />,
});

let _dayPickerChunk: Promise<unknown> | null = null;
function preloadDayPicker(): void {
  _dayPickerChunk ??= import("react-day-picker");
}

const DATE_PICKER_PAST_YEARS = 100;
const DATE_PICKER_FUTURE_YEARS = 20;

interface DatePickerProps {
  value: string | null;
  onChange: (v: string | null) => void;
  ariaLabel: string;
  placeholder?: string;
  triggerClassName?: string;
  placeholderClassName?: string;
  formatLabel?: (ymd: string) => string;
  defaultOpen?: boolean;
  dayAccessory?: (localYmd: string) => DayAccessory | null;
  onMonthChange?: (month: Date) => void;
  onOpenChange?: (open: boolean) => void;
  onPresetRange?: (range: YmdRange) => void;
}

export function DatePicker({
  value,
  onChange,
  ariaLabel,
  placeholder = "Select date",
  triggerClassName,
  placeholderClassName,
  formatLabel,
  defaultOpen = false,
  dayAccessory,
  onMonthChange,
  onOpenChange,
  onPresetRange,
}: DatePickerProps): React.ReactNode {
  const [open, setOpenState] = useState(defaultOpen);
  const setOpen = (next: boolean): void => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const selected = value !== null ? (parseYmd(value) ?? undefined) : undefined;
  const label = value !== null ? (formatLabel ?? formatMdy)(value) : "";
  const currentYear = new Date().getFullYear();
  const startMonth = new Date(currentYear - DATE_PICKER_PAST_YEARS, 0);
  const endMonth = new Date(currentYear + DATE_PICKER_FUTURE_YEARS, 11);
  const components = useMemo(
    () =>
      dayAccessory === undefined ? undefined : { DayButton: dayAccessoryButton(dayAccessory) },
    [dayAccessory],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        onMouseEnter={preloadDayPicker}
        onFocus={preloadDayPicker}
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
        <div className="flex gap-2">
          {onPresetRange !== undefined && (
            <RangePresetRail
              onPick={(range) => {
                onPresetRange(range);
                setOpen(false);
              }}
            />
          )}
          <div>
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
              onMonthChange={onMonthChange}
              components={components}
            />
            <div className="flex justify-end border-t pt-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
