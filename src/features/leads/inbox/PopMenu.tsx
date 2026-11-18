"use client";
import type React from "react";
import { useCallback, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

export interface PopMenuProps {
  trigger: React.ReactNode;
  triggerLabel: string;
  triggerClassName: string;
  panelClassName?: string;
  align?: "left" | "right";
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
}

export function PopMenu({
  trigger,
  triggerLabel,
  triggerClassName,
  panelClassName,
  align = "left",
  disabled = false,
  children,
}: PopMenuProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={triggerLabel} className={triggerClassName} disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align={align === "right" ? "end" : "start"}
        className={`p-1 text-sm ${panelClassName ?? "min-w-44"}`}
      >
        {children(close)}
      </PopoverContent>
    </Popover>
  );
}

export const POP_ITEM = "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent";
