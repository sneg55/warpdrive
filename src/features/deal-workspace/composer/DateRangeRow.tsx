"use client";
import type React from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";

interface Props {
  startDate: string;
  onStartDate: (v: string) => void;
  startTime: string;
  onStartTime: (v: string) => void;
  endTime: string;
  onEndTime: (v: string) => void;
  // Multi-day end date (Pipedrive parity). Empty string means a same-day activity.
  endDate: string;
  onEndDate: (v: string) => void;
}

// Compact, single-row date/time controls (Pipedrive parity, C2): start date + time, an end
// time, and an optional end date for multi-day activities. Replaces the composer's stacked
// labeled blocks. Kept as its own component to hold ActivityComposerInline under the file cap.
export function DateRangeRow({
  startDate,
  onStartDate,
  startTime,
  onStartTime,
  endTime,
  onEndTime,
  endDate,
  onEndDate,
}: Props): React.ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DatePicker
        ariaLabel="Start date"
        value={startDate === "" ? null : startDate}
        onChange={(v) => onStartDate(v ?? "")}
      />
      <TimePicker ariaLabel="Start time" value={startTime} onChange={onStartTime} />
      <span aria-hidden="true" className="text-muted-foreground">
        to
      </span>
      <TimePicker ariaLabel="End time" value={endTime} onChange={onEndTime} />
      <DatePicker
        ariaLabel="End date"
        placeholder="End date"
        value={endDate === "" ? null : endDate}
        onChange={(v) => onEndDate(v ?? "")}
      />
    </div>
  );
}
