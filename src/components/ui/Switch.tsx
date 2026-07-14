"use client";
import type React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  // Optional id so a visible <label htmlFor> can forward clicks to this control
  // (restores click-to-toggle on the label text without a wrapping <label>).
  id?: string;
}

// Minimal accessible toggle switch (no external dep). Token-styled; on = success.
export function Switch({ checked, onCheckedChange, label, id }: SwitchProps): React.ReactNode {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-success" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block h-3 w-3 transform rounded-full bg-background transition-transform",
          checked ? "translate-x-3.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
