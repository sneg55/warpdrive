"use client";
import type React from "react";
import type { UserStatusFilter } from "./userStatus";

const TABS: { key: UserStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "invited", label: "Invited" },
  { key: "deactivated", label: "Deactivated" },
];

// Status filter tabs for the Manage users table (S-U3).
export function UserStatusTabs({
  value,
  onChange,
}: {
  value: UserStatusFilter;
  onChange: (status: UserStatusFilter) => void;
}): React.ReactNode {
  return (
    <nav aria-label="user status filter" className="flex gap-1">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={value === t.key}
          onClick={() => onChange(t.key)}
          className={
            value === t.key
              ? "rounded bg-accent px-3 py-1 text-sm font-medium text-accent-foreground transition-transform active:scale-[0.96]"
              : "rounded px-3 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent/60 active:scale-[0.96]"
          }
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
