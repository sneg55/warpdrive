"use client";
import type React from "react";
import { cn } from "@/lib/utils";

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
