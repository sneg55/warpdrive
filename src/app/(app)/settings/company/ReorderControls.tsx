"use client";
import { ArrowDown, ArrowUp } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/Button";
import { Tip } from "@/components/ui/tooltip";
import { STRINGS } from "@/constants/strings";

const S = STRINGS.settings;
const ICON_BUTTON =
  "relative size-7 shrink-0 p-0 text-muted-foreground after:absolute after:size-10 after:content-['']";

interface ReorderControlsProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

// Shared reorder affordance for compact settings rows. The visible controls stay small while the
// non-overlapping pseudo-element targets preserve a 40px hit area.
export function ReorderControls({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: ReorderControlsProps): React.ReactNode {
  return (
    <div className="flex items-center gap-3">
      <Tip label={S.moveUp}>
        <Button
          variant="ghost"
          size="icon"
          className={ICON_BUTTON}
          aria-label={S.moveUp}
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          <ArrowUp aria-hidden="true" className="size-4" />
        </Button>
      </Tip>
      <Tip label={S.moveDown}>
        <Button
          variant="ghost"
          size="icon"
          className={ICON_BUTTON}
          aria-label={S.moveDown}
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          <ArrowDown aria-hidden="true" className="size-4" />
        </Button>
      </Tip>
    </div>
  );
}
