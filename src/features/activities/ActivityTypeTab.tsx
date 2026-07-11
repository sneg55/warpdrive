"use client";
import type React from "react";
import { cn } from "@/lib/utils";
import { ActivityTypeIcon } from "./ActivityTypeIcon";

// Extracted from ActivitiesTable to keep it under the project's file-size budget.
export function ActivityTypeTab({
  active,
  value,
  label,
  icon,
  onSelect,
}: {
  active: string | null;
  value: string | null;
  label: string;
  icon?: boolean;
  onSelect: (v: string | null) => void;
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm capitalize",
        active === value
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {icon === true && value !== null && <ActivityTypeIcon typeKey={value} />}
      {label}
    </button>
  );
}
