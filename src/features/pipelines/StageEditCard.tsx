"use client";
import type React from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { DEFAULT_ROTTING_DAYS } from "@/constants/pipelineDefaults";
import type { StageRow } from "./stageDiff";

interface StageEditCardProps {
  row: StageRow;
  index: number;
  canDelete: boolean;
  onChange: (patch: Partial<StageRow>) => void;
  onDelete: () => void;
}

// One stage column in the Edit Pipeline page (each stage is a card with a name and an optional
// rotting-days threshold). Presentational: all state lives in the parent so the save-diff can
// read a single source of truth.
export function StageEditCard({
  row,
  index,
  canDelete,
  onChange,
  onDelete,
}: StageEditCardProps): React.ReactNode {
  const rottingEnabled = row.rottingDays !== null;
  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Stage {index + 1}</span>
        <button
          type="button"
          aria-label={`Delete stage ${index + 1}`}
          disabled={!canDelete}
          onClick={onDelete}
          className="grid size-10 -m-2 place-items-center rounded text-muted-foreground transition-transform hover:bg-accent hover:text-red-600 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Stage name</span>
        <input
          aria-label={`Stage ${index + 1} name`}
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full rounded-md border px-2.5 py-1.5 text-sm"
        />
      </label>

      <div className="text-sm">
        <div className="flex items-center gap-2">
          <Checkbox
            label={`Stage ${index + 1} rotting enabled`}
            checked={rottingEnabled}
            onCheckedChange={(v) => onChange({ rottingDays: v ? DEFAULT_ROTTING_DAYS : null })}
          />
          <span className="font-medium">Rotting in (days)</span>
        </div>
        {rottingEnabled && (
          <input
            aria-label={`Stage ${index + 1} rotting days`}
            type="number"
            min={1}
            value={row.rottingDays ?? DEFAULT_ROTTING_DAYS}
            onChange={(e) => onChange({ rottingDays: Math.max(1, Number(e.target.value) || 1) })}
            className="mt-2 w-full rounded-md border px-2.5 py-1.5 text-sm"
          />
        )}
      </div>
    </div>
  );
}
