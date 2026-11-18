"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Tip } from "@/components/ui/tooltip";
import { changeStageAction } from "@/features/deal-workspace/actions";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { stageSegmentStyle } from "@/features/deals/boardStageHeader";
import { readCsrfToken } from "@/utils/csrfCookie";

interface StageChipView {
  id: string;
  name: string;
  current: boolean;
  passed: boolean;
  days: number;
}

interface StageSelectorProps {
  dealId: string;
  expectedUpdatedAt: string;
  chips: StageChipView[];
}

const NOTCH = "0.75rem";
const FIRST_CLIP =
  "polygon(0 0, calc(100% - 0.75rem) 0, 100% 50%, calc(100% - 0.75rem) 100%, 0 100%)";
const MID_CLIP = `polygon(0 0, calc(100% - 0.75rem) 0, 100% 50%, calc(100% - 0.75rem) 100%, 0 100%, ${NOTCH} 50%)`;

function segmentState(chip: StageChipView): "current" | "passed" | "future" {
  if (chip.current) return "current";
  if (chip.passed) return "passed";
  return "future";
}

export function StageSelector({
  dealId,
  expectedUpdatedAt,
  chips,
}: StageSelectorProps): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();
  const [pending, setPending] = useState(false);

  async function select(chip: StageChipView): Promise<void> {
    if (chip.current || pending) return;
    setPending(true);
    const r = await changeStageAction(
      { dealId, toStageId: chip.id, expectedUpdatedAt },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  return (
    <div role="listbox" aria-label="Stage" className="flex min-w-0 items-stretch rounded-md">
      {chips.map((chip, idx) => {
        const fill = stageSegmentStyle(idx, segmentState(chip));
        return (
          <Tip key={chip.id} label={chip.name}>
            <button
              type="button"
              role="option"
              aria-selected={chip.current}
              aria-current={chip.current ? "step" : undefined}
              disabled={pending}
              onClick={() => void select(chip)}
              className={[
                "relative flex min-w-0 flex-col items-start truncate px-4 py-1 text-xs leading-tight text-foreground transition-transform hover:opacity-90 disabled:cursor-default disabled:opacity-70",
                idx > 0 ? "-ml-2 pl-6" : "",
                chip.current ? "z-10 scale-[1.08] drop-shadow-sm" : "z-0",
              ]
                .join(" ")
                .trim()}
              style={{
                clipPath: idx === 0 ? FIRST_CLIP : MID_CLIP,
                backgroundColor: fill.backgroundColor,
                fontWeight: fill.fontWeight,
              }}
            >
              <span className="max-w-full truncate">{chip.name}</span>
              <span className="text-xs tabular-nums opacity-80">
                {chip.days} {chip.days === 1 ? "day" : "days"}
              </span>
            </button>
          </Tip>
        );
      })}
    </div>
  );
}
