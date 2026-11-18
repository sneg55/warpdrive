"use client";
import type React from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { BoardEmptyKind } from "./boardEmptyKind";
import {
  BOARD_CLEAR_FILTERS,
  BOARD_EMPTY_BODY,
  BOARD_EMPTY_FILTERED_BODY,
  BOARD_EMPTY_FILTERED_TITLE,
  BOARD_EMPTY_TITLE,
  BOARD_EMPTY_UNSURE_BODY,
  BOARD_EMPTY_UNSURE_TITLE,
} from "./boardFilterCopy";

interface BoardEmptyProps {
  kind: Exclude<BoardEmptyKind, "none">;
  onClearFilters: () => void;
  addSlot: React.ReactNode;
}

export function BoardEmpty({ kind, onClearFilters, addSlot }: BoardEmptyProps): React.ReactNode {
  const clearFilters = (
    <Button size="sm" variant="outline" onClick={onClearFilters}>
      {BOARD_CLEAR_FILTERS}
    </Button>
  );

  if (kind === "filtered") {
    return (
      <EmptyState
        title={BOARD_EMPTY_FILTERED_TITLE}
        body={BOARD_EMPTY_FILTERED_BODY}
        action={clearFilters}
      />
    );
  }
  if (kind === "unsure") {
    return (
      <EmptyState
        title={BOARD_EMPTY_UNSURE_TITLE}
        body={BOARD_EMPTY_UNSURE_BODY}
        action={
          <div className="flex items-center gap-2">
            {clearFilters}
            {addSlot}
          </div>
        }
      />
    );
  }
  return <EmptyState title={BOARD_EMPTY_TITLE} body={BOARD_EMPTY_BODY} action={addSlot} />;
}
