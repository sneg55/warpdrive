"use client";
import { X } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/Badge";
import {
  ACTIVITY_DONE_BASIS_CHIP,
  ACTIVITY_DONE_BASIS_CHIP_REMOVE,
  ACTIVITY_PIPELINE_CHIP_REMOVE,
  ACTIVITY_SCOPE_CHIPS_LABEL,
  activityPipelineChipLabel,
} from "./activityScopeCopy";
import type { ActivityListFilter } from "./schemas";

interface ScopeChip {
  key: string;
  label: string;
  removeLabel: string;
  next: ActivityListFilter;
}

interface ActivityScopeChipsProps {
  filter: ActivityListFilter;
  pipelineName: string | null;
  onChange: (f: ActivityListFilter) => void;
}

function scopeChips(filter: ActivityListFilter, pipelineName: string | null): ScopeChip[] {
  const chips: ScopeChip[] = [];
  if (filter.pipelineId !== null) {
    chips.push({
      key: "pipeline",
      label: activityPipelineChipLabel(pipelineName),
      removeLabel: ACTIVITY_PIPELINE_CHIP_REMOVE,
      next: { ...filter, pipelineId: null },
    });
  }
  if (filter.dateBasis === "done") {
    chips.push({
      key: "basis",
      label: ACTIVITY_DONE_BASIS_CHIP,
      removeLabel: ACTIVITY_DONE_BASIS_CHIP_REMOVE,
      next: { ...filter, dateBasis: "due" },
    });
  }
  return chips;
}

export function ActivityScopeChips({
  filter,
  pipelineName,
  onChange,
}: ActivityScopeChipsProps): React.ReactNode {
  const chips = scopeChips(filter, pipelineName);
  if (chips.length === 0) return null;
  return (
    <ul aria-label={ACTIVITY_SCOPE_CHIPS_LABEL} className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Badge variant="secondary" className="gap-1 py-1">
            <span className="max-w-56 truncate">{chip.label}</span>
            <button
              type="button"
              aria-label={chip.removeLabel}
              onClick={() => onChange(chip.next)}
              className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
