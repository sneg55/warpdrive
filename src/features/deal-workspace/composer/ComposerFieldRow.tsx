"use client";
import type React from "react";
import { cn } from "@/lib/utils";

// One activity-composer field row with Pipedrive's leading-icon gutter (the "7-icon left rail"):
// a fixed icon column on the left, the field on the right. `iconAlign="top"` keeps the icon at the
// top of taller controls (note, guests, links); the default centers it against a single-line field.
export function ComposerFieldRow({
  icon,
  children,
  iconAlign = "center",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  iconAlign?: "center" | "top";
}): React.ReactNode {
  return (
    <div className="flex gap-2.5">
      <span
        className={cn(
          "flex w-4 shrink-0 justify-center text-muted-foreground",
          iconAlign === "top" ? "mt-1.5" : "self-center",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
