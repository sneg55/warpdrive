"use client";
import type React from "react";
import { Button } from "@/components/ui/Button";
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
    <fieldset
      aria-label="User status filter"
      className="flex min-w-0 items-center gap-1 border-0 p-0"
    >
      {TABS.map((tab) => (
        <Button
          key={tab.key}
          variant="ghost"
          size="sm"
          aria-pressed={value === tab.key}
          onClick={() => onChange(tab.key)}
          className="min-h-10 rounded px-3 font-normal text-muted-foreground hover:bg-accent/60 aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-accent-foreground"
        >
          {tab.label}
        </Button>
      ))}
    </fieldset>
  );
}
