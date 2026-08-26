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
  // The list view's real add-deal control, so the empty state offers the same button the toolbar
  // does instead of a second, different one. The archive never shows it: nothing is created there.
  addSlot: React.ReactNode;
}

// The deals list or archive with no rows. Which sentence is true depends on why it is empty, so a
// filter that excluded everything never reads as an empty pipeline.
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
