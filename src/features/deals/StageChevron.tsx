"use client";
import type React from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { cn } from "@/lib/utils";
import { funnelClip, stageSegmentStyle } from "./boardStageHeader";

interface StageChevronProps {
  stages: Array<{ id: string; name: string }>;
  selectedId: string;
  onSelect: (stageId: string) => void;
}

export function StageChevron({ stages, selectedId, onSelect }: StageChevronProps): React.ReactNode {
  return (
    <RadioGroup
      value={selectedId}
      onValueChange={onSelect}
      aria-label="Pipeline stage"
      className="flex w-full gap-0 overflow-hidden"
    >
      {stages.map((s, i) => {
        const selected = s.id === selectedId;
        const fill = stageSegmentStyle(i, selected ? "current" : "future");
        return (
          <RadioGroupItem
            key={s.id}
            value={s.id}
            style={{
              clipPath: funnelClip(i === 0),
              backgroundColor: fill.backgroundColor,
              fontWeight: fill.fontWeight,
            }}
            className={cn(
              "-ml-1 flex-1 truncate px-3 py-1.5 text-center text-xs text-foreground transition-opacity first:ml-0 hover:opacity-90",
            )}
          >
            {s.name}
          </RadioGroupItem>
        );
      })}
    </RadioGroup>
  );
}
