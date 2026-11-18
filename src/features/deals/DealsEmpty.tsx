"use client";
import Link from "next/link";
import type React from "react";
import { Button, buttonVariants } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { STRINGS } from "@/constants/strings";

export interface DealsEmptyProps {
  variant: "list" | "archived";
  pipelineId: string;
  filtered: boolean;
  onClearFilters: () => void;
  addSlot: React.ReactNode;
}

export function DealsEmpty({
  variant,
  pipelineId,
  filtered,
  onClearFilters,
  addSlot,
}: DealsEmptyProps): React.ReactNode {
  if (filtered) {
    return (
      <EmptyState
        title={STRINGS.dealsList.emptyFilteredTitle}
        body={STRINGS.dealsList.emptyFilteredBody}
        action={
          <Button size="sm" variant="outline" onClick={onClearFilters}>
            {STRINGS.dealsList.emptyFilteredAction}
          </Button>
        }
      />
    );
  }
  if (variant === "archived") {
    return (
      <EmptyState
        title={STRINGS.dealsList.emptyArchivedTitle}
        body={STRINGS.dealsList.emptyArchivedBody}
        action={
          <Link href={`/pipeline/${pipelineId}`} className={buttonVariants({ size: "sm" })}>
            {STRINGS.dealsList.emptyArchivedAction}
          </Link>
        }
      />
    );
  }
  return (
    <EmptyState
      title={STRINGS.dealsList.emptyTitle}
      body={STRINGS.dealsList.emptyBody}
      action={addSlot}
    />
  );
}
