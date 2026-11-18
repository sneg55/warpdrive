"use client";
import type React from "react";
import { useState } from "react";
import { SavedViewControl } from "@/features/saved-filters/SavedViewControl";
import type { LeadConditionInput } from "../schemas";
import { LeadFilterBuilder } from "./LeadFilterBuilder";

interface LeadsFilterControlsProps {
  users: ReadonlyArray<{ id: string; name: string }>;
  condition: LeadConditionInput | null;
  onCondition: (condition: LeadConditionInput | null) => void;
}

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
          setSavedViewId(null);
          onCondition(next);
        }}
      />
    </>
  );
}
