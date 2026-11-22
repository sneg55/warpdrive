"use client";
import { Archive, Kanban, List, Pencil } from "lucide-react";
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
  currency: string;
  activeView?: BoardToolbarView;
  presence?: React.ReactNode;
  createSlot?: React.ReactNode;
  filterSlot?: React.ReactNode;
  sortSlot?: React.ReactNode;
  quickFilters?: React.ReactNode;
  canManagePipelines?: boolean;
}

const ICON_BTN =
  "flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors";
const ACTIVE = "bg-accent text-accent-foreground font-medium";
const IDLE = "text-muted-foreground hover:text-foreground";

export function BoardToolbar(props: BoardToolbarProps): React.ReactNode {
  const { pipelineId, pipelines, totalValue, dealCount, activeView = "board" } = props;
  const { presence, createSlot, filterSlot, sortSlot, quickFilters, canManagePipelines } = props;
  const { currency } = props;
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
            <Kanban aria-hidden="true" className="h-4 w-4" />
            Board
          </Link>
          <Link
            href={`/pipeline/${pipelineId}/list`}
            aria-label="List view"
            aria-current={current("list")}
            className={cn(ICON_BTN, activeView === "list" ? ACTIVE : IDLE)}
          >
            <List aria-hidden="true" className="h-4 w-4" />
            List
          </Link>
          <Link
            href={`/pipeline/${pipelineId}/archived`}
            aria-label="Archive view"
            aria-current={current("archived")}
            className={cn(ICON_BTN, activeView === "archived" ? ACTIVE : IDLE)}
          >
            <Archive aria-hidden="true" className="h-4 w-4" />
            Archive
          </Link>
        </div>

        {createSlot}

        <div className="ml-auto flex items-center gap-3">
          <BoardSummary totalValue={totalValue} dealCount={dealCount} currency={currency} />
          <PipelineSelect
            pipelineId={pipelineId}
            pipelines={pipelines}
            canManagePipelines={canManagePipelines}
          />

          <Link
            href={`/pipeline/${pipelineId}/edit`}
            aria-label="Edit pipeline"
            className={ICON_BUTTON}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
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
