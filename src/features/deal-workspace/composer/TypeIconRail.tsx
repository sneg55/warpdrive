"use client";
import type React from "react";
import { ActivityTypeIcon } from "@/features/activities/typeIcons";
import { cn } from "@/lib/utils";

interface TypeOption {
  id: string;
  key: string;
  name: string;
}

export function TypeIconRail({
  types,
  value,
  onChange,
}: {
  types: TypeOption[];
  value: string;
  onChange: (id: string) => void;
}): React.ReactNode {
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={t.id === value}
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition-transform active:scale-[0.96]",
            t.id === value
              ? "border-primary bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ActivityTypeIcon typeKey={t.key} />
          {t.name}
        </button>
      ))}
    </div>
  );
}
