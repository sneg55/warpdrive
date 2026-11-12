import type React from "react";
import { RANGE_PRESET_KEYS, RANGE_PRESET_LABELS } from "@/constants/rangePresets";
import { Button } from "./Button";
import { resolveRangePreset, type YmdRange } from "./rangePresets";

export function RangePresetRail({
  onPick,
}: {
  onPick: (range: YmdRange) => void;
}): React.ReactNode {
  return (
    <div className="flex w-32 shrink-0 flex-col gap-0.5 border-r pr-2">
      {RANGE_PRESET_KEYS.map((key) => (
        <Button
          key={key}
          variant="ghost"
          size="sm"
          className="h-8 justify-start px-2 font-normal"
          onClick={() => onPick(resolveRangePreset(key, new Date()))}
        >
          {RANGE_PRESET_LABELS[key]}
        </Button>
      ))}
    </div>
  );
}
