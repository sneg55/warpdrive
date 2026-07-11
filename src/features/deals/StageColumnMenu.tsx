"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type React from "react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddDealModal } from "./AddDealModal";
import { BOARD_QUERY_KEY } from "./useDealMove";

interface Option {
  id: string;
  name: string;
}

export interface StageColumnMenuProps {
  pipelineId: string;
  stageId: string;
  stageName: string;
  pipelines: Array<Option & { stages: Option[] }>;
  baseCurrency?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// P1: the per-column "Actions" menu Pipedrive reveals on stage-header hover. Warpdrive column
// headers previously had no per-column control. The column-scoped actions that make sense here:
// add a deal preset to this stage, jump to the stage editor, and collapse/expand the lane. The
// add-deal item reuses AddDealModal (same path as StageAddButton's ghost button at the lane foot).
export function StageColumnMenu(props: StageColumnMenuProps): React.ReactNode {
  const { pipelineId, stageId, stageName, pipelines, baseCurrency } = props;
  const { collapsed, onToggleCollapse } = props;
  // Stage name is folded into the trigger's accessible name so screen-reader users know which
  // column's actions they are opening (multiple identical "Stage actions" triggers otherwise).
  const triggerLabel = `Stage actions: ${stageName}`;
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={triggerLabel}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onSelect={() => setAddOpen(true)}>
            Add deal to this stage
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/pipeline/${pipelineId}/edit`}>Edit pipeline stages</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleCollapse}>
            {collapsed ? "Expand column" : "Collapse column"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {addOpen && (
        <AddDealModal
          pipelineId={pipelineId}
          pipelines={pipelines}
          baseCurrency={baseCurrency}
          stageId={stageId}
          onClose={() => setAddOpen(false)}
          onCreated={() => void qc.invalidateQueries({ queryKey: BOARD_QUERY_KEY(pipelineId) })}
        />
      )}
    </>
  );
}
