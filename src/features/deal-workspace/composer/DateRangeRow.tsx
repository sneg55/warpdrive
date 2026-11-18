"use client";
import type React from "react";
import { TimePicker } from "@/components/ui/TimePicker";
import { ActivityDatePicker } from "@/features/activities/ActivityDatePicker";

interface Props {
  startDate: string;
  onStartDate: (v: string) => void;
  startTime: string;
  onStartTime: (v: string) => void;
  endTime: string;
  onEndTime: (v: string) => void;
  endDate: string;
  onEndDate: (v: string) => void;
  assigneeId: string;
}

export function DateRangeRow({
  startDate,
  onStartDate,
  startTime,
  onStartTime,
  endTime,
  onEndTime,
  endDate,
  onEndDate,
  assigneeId,
}: Props): React.ReactNode {
  const loadFor = assigneeId === "" ? null : assigneeId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActivityDatePicker
        ariaLabel="Start date"
        value={startDate === "" ? null : startDate}
        onChange={(v) => onStartDate(v ?? "")}
        assigneeId={loadFor}
      />
      <TimePicker ariaLabel="Start time" value={startTime} onChange={onStartTime} />
      <span aria-hidden="true" className="text-muted-foreground">
        to
      </span>
      <TimePicker ariaLabel="End time" value={endTime} onChange={onEndTime} />
      <ActivityDatePicker
        ariaLabel="End date"
        placeholder="End date"
        value={endDate === "" ? null : endDate}
        onChange={(v) => onEndDate(v ?? "")}
        assigneeId={loadFor}
      />
    </div>
  );
}
