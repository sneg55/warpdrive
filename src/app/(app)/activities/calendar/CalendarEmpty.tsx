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
  // Whether this window holds anything before the filter runs, so a genuinely empty window is
  // never described as one the filters emptied.
  hasUnfilteredActivities: boolean;
  // Seeds the composer with the window on screen, so "Add activity" from an empty June week does
  // not create one in today's week.
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
