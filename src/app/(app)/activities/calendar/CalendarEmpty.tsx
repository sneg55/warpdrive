"use client";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddActivityModal } from "@/features/activities/AddActivityModal";
import type { CalendarViewName } from "@/features/activities/calendarView";
import { calendarEmptyState } from "./calendarEmptyState";

export interface CalendarEmptyProps {
  view: CalendarViewName;
  hasFilter: boolean;
  hasUnfilteredActivities: boolean;
  dateIso: string;
  onClearFilters: () => void;
  onCreated: () => void;
}

export function CalendarEmpty({
  view,
  hasFilter,
  hasUnfilteredActivities,
  dateIso,
  onClearFilters,
  onCreated,
}: CalendarEmptyProps): React.ReactNode {
  const [addOpen, setAddOpen] = useState(false);
  const state = calendarEmptyState({ view, hasFilter, hasUnfilteredActivities });

  return (
    <>
      <EmptyState
        title={state.title}
        body={state.body}
        className="py-10"
        action={
          <Button
            size="sm"
            onClick={() => (state.kind === "filtered" ? onClearFilters() : setAddOpen(true))}
          >
            {state.action}
          </Button>
        }
      />
      {addOpen && (
        <AddActivityModal
          defaultDate={dateIso}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            onCreated();
            setAddOpen(false);
          }}
        />
      )}
    </>
  );
}
