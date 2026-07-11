"use client";
import type React from "react";

// One labeled text input inside a section bulk editor. The label doubles as the input's
// accessible name so the whole section's fields are individually reachable while open at once.
export function BulkEditRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}): React.ReactNode {
  return (
    <label className="flex flex-col gap-0.5 text-muted-foreground text-xs">
      {label}
      <input
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded border border-field-border bg-card px-2 text-foreground text-sm"
      />
    </label>
  );
}
