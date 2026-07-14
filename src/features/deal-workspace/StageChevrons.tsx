import type React from "react";
import { Tip } from "@/components/ui/tooltip";
import { stageSegmentStyle } from "@/features/deals/boardStageHeader";

// Pipedrive's signature deal-detail element: a connected chevron pipeline where
// each stage is an arrow segment. Passed stages read as "done", the current
// stage is highlighted, upcoming stages are muted. Segments interlock via a
// clip-path notch + overlap, so they connect visually with no "to" text.
export interface StageChip {
  id: string;
  name: string;
  current: boolean;
  passed: boolean;
}

// Arrow shape: flat left edge, pointed right edge, with a matching left notch on
// all but the first segment so neighbours interlock.
const NOTCH = "0.75rem";
const FIRST_CLIP =
  "polygon(0 0, calc(100% - 0.75rem) 0, 100% 50%, calc(100% - 0.75rem) 100%, 0 100%)";
const MID_CLIP = `polygon(0 0, calc(100% - 0.75rem) 0, 100% 50%, calc(100% - 0.75rem) 100%, 0 100%, ${NOTCH} 50%)`;

// Inherit the pipeline board's per-order hue ramp (stageSegmentStyle) instead of a uniform
// primary/success/muted set: each segment is tinted in its own stage color, and progress reads
// via fill intensity (passed/current deepen the hue, current bolds). See boardStageHeader.ts.
function segmentState(chip: StageChip): "current" | "passed" | "future" {
  if (chip.current) return "current";
  if (chip.passed) return "passed";
  return "future";
}

export function StageChevrons({ chips }: { chips: StageChip[] }): React.ReactNode {
  return (
    <ol className="flex min-w-0 items-stretch overflow-hidden rounded-md">
      {chips.map((chip, idx) => {
        const fill = stageSegmentStyle(idx, segmentState(chip));
        return (
          <Tip key={chip.id} label={chip.name}>
            <li
              aria-current={chip.current ? "step" : undefined}
              className={[
                "truncate px-4 py-1 text-xs leading-5 text-foreground",
                idx > 0 ? "-ml-2 pl-6" : "",
              ]
                .join(" ")
                .trim()}
              style={{
                clipPath: idx === 0 ? FIRST_CLIP : MID_CLIP,
                backgroundColor: fill.backgroundColor,
                fontWeight: fill.fontWeight,
              }}
            >
              {chip.name}
            </li>
          </Tip>
        );
      })}
    </ol>
  );
}
