"use client";
import { X } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  BOARD_CHIPS_LABEL,
  BOARD_CLEAR_ALL,
  conditionChipLabel,
  ownerChipLabel,
  savedFilterChipLabel,
} from "./boardFilterCopy";

interface BoardFilterChipsProps {
  ownerName: string | null;
  savedFilterName: string | null;
  conditionCount: number;
  onClearOwner: () => void;
  onClearSavedFilter: () => void;
  onClearConditions: () => void;
  onClearAll: () => void;
}

interface AppliedChip {
  key: string;
  label: string;
  removeLabel: string;
  onClear: () => void;
}

// The three ways a board narrows, each visible and each removable on its own. The Filter trigger
// can name at most one of them, so without this row an owner selection or an ad-hoc definition is
// invisible until the menu is opened.
export function BoardFilterChips(props: BoardFilterChipsProps): React.ReactNode {
  const { ownerName, savedFilterName, conditionCount, onClearAll } = props;
  const { onClearOwner, onClearSavedFilter, onClearConditions } = props;

  const chips: AppliedChip[] = [];
  if (ownerName !== null) {
    chips.push({
      key: "owner",
      label: ownerChipLabel(ownerName),
      removeLabel: "Remove owner filter",
      onClear: onClearOwner,
    });
  }
  if (savedFilterName !== null) {
    chips.push({
      key: "saved",
      label: savedFilterChipLabel(savedFilterName),
      removeLabel: "Remove saved filter",
      onClear: onClearSavedFilter,
    });
  }
  if (conditionCount > 0) {
    chips.push({
      key: "conditions",
      label: conditionChipLabel(conditionCount),
      removeLabel: "Remove conditions",
      onClear: onClearConditions,
    });
  }
  if (chips.length === 0) return null;

  return (
    <ul aria-label={BOARD_CHIPS_LABEL} className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Badge variant="secondary" className="gap-1 py-1">
            <span className="max-w-56 truncate">{chip.label}</span>
            <button
              type="button"
              aria-label={chip.removeLabel}
              onClick={chip.onClear}
              className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          </Badge>
        </li>
      ))}
      <li>
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          {BOARD_CLEAR_ALL}
        </Button>
      </li>
    </ul>
  );
}
