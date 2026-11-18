"use client";
import type React from "react";
import { useHideEmpty } from "./sectionFilter";

export function FieldRow({
  label,
  children,
  icon,
  empty = false,
  labelAlign = "right",
}: {
  label: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  empty?: boolean;
  labelAlign?: "left" | "right";
}): React.ReactNode {
  const hideEmpty = useHideEmpty();
  if (empty && hideEmpty) return null;
  return (
    <div
      data-testid="field-row"
      className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-3 py-1.5"
    >
      <span
        className={
          labelAlign === "left"
            ? "flex items-center justify-start gap-1 text-left text-xs font-medium leading-[18px] text-muted-foreground"
            : "flex items-center justify-end gap-1 text-right text-xs font-medium leading-[18px] text-muted-foreground"
        }
      >
        {icon}
        {label}
      </span>
      <span
        data-testid="field-row-value"
        className="min-w-0 break-words text-left text-sm text-foreground"
      >
        {children}
      </span>
    </div>
  );
}
