"use client";
import type React from "react";
import { Button } from "@/components/ui/Button";

// Generic selection-count + clear shell. Feature lists (leads, later people/orgs/
// email/activities) pass their own action buttons as children.
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/40 px-3 py-2">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="mx-1 h-4 w-px bg-border" />
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Clear selection"
        onClick={onClear}
        className="ml-auto text-muted-foreground hover:text-foreground"
      >
        Clear selection
      </Button>
    </div>
  );
}
