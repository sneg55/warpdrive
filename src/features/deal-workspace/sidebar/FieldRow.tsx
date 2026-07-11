"use client";
import type React from "react";
import { useHideEmpty } from "./sectionFilter";

// Shared deal/person/org field row: a two-column grid with one label token and a left-aligned
// value column. Editable rows compose their trigger inside this renderer so alignment cannot drift.
// `empty` marks a value-less row so the section's funnel toggle can hide it.
// `labelAlign` controls the label column: "right" (default) hugs the value; "left" hangs the label
// at the column start, matching Pipedrive's left-aligned Summary block (the other sidebar sections
// keep the right-aligned default).
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
      // py-1.5 + 20px value line = PD's 32px field-row pitch (values are plain spans now;
      // the old whole-value edit buttons carried 4px of their own padding).
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
