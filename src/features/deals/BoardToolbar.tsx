"use client";
import Link from "next/link";
import type React from "react";
import { ICON_BUTTON } from "@/constants/formStyles";
import { cn } from "@/lib/utils";
import { BoardActionsMenu } from "./BoardActionsMenu";
import { BoardSummary } from "./BoardSummary";
import { PipelineSelect } from "./PipelineSelect";

export type BoardToolbarView = "board" | "list" | "archived";

export interface BoardToolbarProps {
  pipelineId: string;
  pipelines: Array<{ id: string; name: string }>;
  totalValue: string;
  dealCount: number;
  // Which of the three views (Board | List | Archive) is active, so the switcher marks the right
  // tab. Defaults to the board so existing board callers need no change.
  activeView?: BoardToolbarView;
  presence?: React.ReactNode;
  // The "+ Deal" control, rendered prominently at the left like Pipedrive.
  createSlot?: React.ReactNode;
  // The board filter dropdown (owners/filters/favorites), rendered in the right cluster.
  filterSlot?: React.ReactNode;
  // The "Sort by" field + direction toggle, rendered right-aligned on the quick-filter row (Pipedrive).
  sortSlot?: React.ReactNode;
  // The quick-filter condition chips row, rendered below the main toolbar row (Pipedrive).
  quickFilters?: React.ReactNode;
}

// P6: a labeled segmented control (icon + text) so List/Archive read as available views, not a
// mystery icon strip. gap-1.5 spaces the glyph from its label; text-sm keeps the strip compact.
const ICON_BTN =
  "flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors";
const ACTIVE = "bg-accent text-accent-foreground font-medium";
const IDLE = "text-muted-foreground hover:text-foreground";

// The controls Pipedrive puts above the board: Board|List|Archive view toggle, add-deal, a board
// summary with a value toggle, a styled pipeline selector, filter/sort, and an actions overflow.
export function BoardToolbar(props: BoardToolbarProps): React.ReactNode {
  const { pipelineId, pipelines, totalValue, dealCount, activeView = "board" } = props;
  const { presence, createSlot, filterSlot, sortSlot, quickFilters } = props;
  const current = (view: BoardToolbarView): "page" | undefined =>
    activeView === view ? "page" : undefined;

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          <Link
            href={`/pipeline/${pipelineId}`}
            aria-label="Board view"
            aria-current={current("board")}
            className={cn(ICON_BTN, activeView === "board" ? ACTIVE : IDLE)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="5" height="16" rx="1" />
              <rect x="10" y="4" width="5" height="11" rx="1" />
              <rect x="17" y="4" width="4" height="7" rx="1" />
            </svg>
            Board
          </Link>
          <Link
            href={`/pipeline/${pipelineId}/list`}
            aria-label="List view"
            aria-current={current("list")}
            className={cn(ICON_BTN, activeView === "list" ? ACTIVE : IDLE)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            List
          </Link>
          <Link
            href={`/pipeline/${pipelineId}/archived`}
            aria-label="Archive view"
            aria-current={current("archived")}
            className={cn(ICON_BTN, activeView === "archived" ? ACTIVE : IDLE)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="4" rx="1" />
              <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
            </svg>
            Archive
          </Link>
        </div>

        {createSlot}

        <div className="ml-auto flex items-center gap-3">
          <BoardSummary totalValue={totalValue} dealCount={dealCount} />
          <PipelineSelect pipelineId={pipelineId} pipelines={pipelines} />

          <Link
            href={`/pipeline/${pipelineId}/edit`}
            aria-label="Edit pipeline"
            className={ICON_BUTTON}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </Link>

          {filterSlot}
          <BoardActionsMenu pipelineId={pipelineId} />
          {presence}
        </div>
      </div>

      {(quickFilters != null || sortSlot != null) && (
        <div className="flex flex-wrap items-center gap-3">
          {quickFilters}
          {sortSlot != null && <div className="ml-auto">{sortSlot}</div>}
        </div>
      )}
    </div>
  );
}
