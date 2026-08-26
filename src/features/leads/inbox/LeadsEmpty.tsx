"use client";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddLeadModal } from "../AddLeadModal";
import { leadsEmptyState } from "./leadsEmptyState";

export interface LeadsEmptyProps {
  archived: boolean;
  hasFilter: boolean;
  baseCurrency?: string;
  onCreated: () => void;
  onClearFilters: () => void;
  onBackToInbox: () => void;
}

// The inbox with nothing in it. Which sentence and which exit depends on WHY it is empty, so the
// wording never claims no lead exists when a filter is what emptied the view.
export function LeadsEmpty({
  archived,
  hasFilter,
  baseCurrency,
  onCreated,
  onClearFilters,
  onBackToInbox,
}: LeadsEmptyProps): React.ReactNode {
  const [addOpen, setAddOpen] = useState(false);
  const state = leadsEmptyState({ archived, hasFilter });

  function onAction(): void {
    if (state.kind === "filtered") {
      onClearFilters();
      return;
    }
    if (state.kind === "none-archived") {
      onBackToInbox();
      return;
    }
    setAddOpen(true);
  }

  return (
    <>
      <EmptyState
        title={state.title}
        body={state.body}
        action={
          <Button size="sm" onClick={onAction}>
            {state.action}
          </Button>
        }
      />
      {addOpen && (
        <AddLeadModal
          baseCurrency={baseCurrency}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            onCreated();
            setAddOpen(false);
          }}
        />
      )}
    </>
  );
}
