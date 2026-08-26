"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { AddDealModal } from "./AddDealModal";
import { BOARD_QUERY_KEY } from "./useDealMove";

interface Option {
  id: string;
  name: string;
}

interface StageAddButtonProps {
  pipelineId: string;
  stageId: string;
  pipelines: Array<Option & { stages: Option[] }>;
  baseCurrency?: string;
}

// Ghost "+" at the bottom of a stage column (Pipedrive). Opens the Add deal dialog preset to this
// column's stage; on create, invalidates the board query so the new card appears in this column.
export function StageAddButton(props: StageAddButtonProps): React.ReactNode {
  const { pipelineId, stageId, pipelines, baseCurrency } = props;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add deal to this stage"
        className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-sm text-muted-foreground transition-[color,border-color,transform] hover:border-ring hover:text-foreground active:scale-[0.96]"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        Deal
      </button>
      {open && (
        <AddDealModal
          pipelineId={pipelineId}
          pipelines={pipelines}
          baseCurrency={baseCurrency}
          stageId={stageId}
          onClose={() => setOpen(false)}
          onCreated={() => void qc.invalidateQueries({ queryKey: BOARD_QUERY_KEY(pipelineId) })}
        />
      )}
    </>
  );
}
