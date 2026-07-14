"use client";
import type React from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Tip } from "@/components/ui/tooltip";
import { STRINGS } from "@/constants/strings";
import { cn } from "@/lib/utils";
import { BOARD_SORT_KEYS, type BoardSortKey, type SortDirection } from "./boardSort";

const SORT = STRINGS.board.sort;

export interface BoardSortControlProps {
  sortKey: BoardSortKey;
  direction: SortDirection;
  onKeyChange: (key: BoardSortKey) => void;
  onToggleDirection: () => void;
}

// The "Sort by" cluster Pipedrive puts above the board: a field dropdown plus an asc/desc
// arrow toggle. The chosen sort applies within each column (BoardColumn stays position-agnostic).
export function BoardSortControl(props: BoardSortControlProps): React.ReactNode {
  const { sortKey, direction, onKeyChange, onToggleDirection } = props;
  // The arrow points the way the data currently reads; the button offers the opposite action.
  const toggleLabel = direction === "asc" ? SORT.descending : SORT.ascending;

  return (
    <div className="inline-flex items-center gap-2">
      {/* Label kept on one line: at the far right of the filter row a wrapping "Sort / by" reads
          as broken. */}
      <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">{SORT.label}</span>
      {/* Field + direction share one bordered pill (like the "+ Deal" split button) so the sort
          reads as a single control rather than three loose pieces. */}
      <div className="inline-flex items-center rounded-md border bg-card">
        <Select
          ariaLabel={SORT.label}
          value={sortKey}
          onChange={(v) => onKeyChange(v as BoardSortKey)}
          options={BOARD_SORT_KEYS.map<SelectOption>((key) => ({
            value: key,
            label: SORT.options[key],
          }))}
          triggerClassName="w-auto rounded-r-none border-0 bg-transparent"
        />
        <Tip label={toggleLabel}>
          <button
            type="button"
            aria-label={toggleLabel}
            onClick={onToggleDirection}
            className="flex items-center justify-center rounded-r-md border-l px-2 py-1.5 text-muted-foreground transition hover:text-foreground active:scale-[0.96]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={cn("h-4 w-4 transition-transform", direction === "desc" && "rotate-180")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Up arrow = ascending; rotated 180deg for descending. */}
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </Tip>
      </div>
    </div>
  );
}
