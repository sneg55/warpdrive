"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react";
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
  baseCurrency: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function StageColumnMenu(props: StageColumnMenuProps): React.ReactNode {
  const { pipelineId, stageId, stageName, pipelines, baseCurrency } = props;
  const { collapsed, onToggleCollapse } = props;
  const triggerLabel = `Stage actions: ${stageName}`;
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={triggerLabel}
          data-telemetry-redact="true"
          className="relative flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-[color,background-color,scale] duration-150 ease-out after:absolute after:-inset-2 after:content-[''] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-colors"
        >
          <Ellipsis aria-hidden="true" className="h-4 w-4" />
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
