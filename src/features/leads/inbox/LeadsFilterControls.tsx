"use client";
import type React from "react";
import { useState } from "react";
import { SavedViewControl } from "@/features/saved-filters/SavedViewControl";
import type { LeadConditionInput } from "../schemas";
import { LeadFilterBuilder } from "./LeadFilterBuilder";

interface LeadsFilterControlsProps {
  // Assignable users, offered as the value dropdown for an Owner condition.
  users: ReadonlyArray<{ id: string; name: string }>;
  condition: LeadConditionInput | null;
  onCondition: (condition: LeadConditionInput | null) => void;
}

// The Leads Inbox filter pair: the saved-view picker and the ad-hoc condition builder. Which view
// is applied is display state of the picker, so it lives here rather than in the inbox.
export function LeadsFilterControls({
  users,
  condition,
  onCondition,
}: LeadsFilterControlsProps): React.ReactNode {
  const [savedViewId, setSavedViewId] = useState<string | null>(null);

  return (
    <>
      <SavedViewControl
        targetEntity="lead"
        allLabel="All leads"
        currentDefinition={condition}
        selectedViewId={savedViewId}
        onSelectView={(view) => {
          setSavedViewId(view?.id ?? null);
          onCondition(view?.definition ?? null);
        }}
      />
      <LeadFilterBuilder
        users={users}
        activeCount={condition?.conditions.length ?? 0}
        appliedCondition={condition}
        onApply={(next) => {
          // An ad-hoc edit is no longer the saved view, so the picker stops claiming it is.
          setSavedViewId(null);
          onCondition(next);
        }}
      />
    </>
  );
}
