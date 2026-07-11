"use client";
import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { AddDealModal } from "./AddDealModal";
import { BOARD_QUERY_KEY } from "./useDealMove";

interface Option {
  id: string;
  name: string;
}

export interface NewDealButtonProps {
  pipelineId: string;
  // Pipelines with their stages, so the modal can offer a pipeline select + stage chevron.
  pipelines: Array<Option & { stages: Option[] }>;
  baseCurrency?: string;
}

// "+ Deal" button: opens the Add deal dialog. (The caret split-menu was dropped: its only item
// was "New deal", identical to the primary button.) On create, invalidates the board query.
export function NewDealButton({
  pipelineId,
  pipelines,
  baseCurrency,
}: NewDealButtonProps): React.ReactNode {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.96]"
      >
        + Deal
      </button>

      {open && (
        <AddDealModal
          pipelineId={pipelineId}
          pipelines={pipelines}
          baseCurrency={baseCurrency}
          onClose={() => setOpen(false)}
          onCreated={() => void qc.invalidateQueries({ queryKey: BOARD_QUERY_KEY(pipelineId) })}
        />
      )}
    </>
  );
}
