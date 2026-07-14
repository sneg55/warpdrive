"use client";
import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
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
      <Button
        type="button"
        variant="default"
        size="sm"
        className="px-3"
        onClick={() => setOpen(true)}
      >
        + Deal
      </Button>

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
