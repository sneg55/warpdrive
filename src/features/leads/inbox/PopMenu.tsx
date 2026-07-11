"use client";
import type React from "react";
import { useCallback, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

export interface PopMenuProps {
  // The trigger's visible content (label text, icon, or both).
  trigger: React.ReactNode;
  triggerLabel: string;
  triggerClassName: string;
  panelClassName?: string;
  align?: "left" | "right";
  children: (close: () => void) => React.ReactNode;
}

// Shared action-bar dropdown, built on the shadcn Popover primitive (focus management, Escape,
// outside-click dismiss, scroll lock, and a portal for free). Popover, NOT DropdownMenu, because
// callers pass heterogeneous form-like content (checkboxes, drag handles, plain buttons, labels),
// not a uniform list of menu actions: a Radix menu would trap Tab and only expose registered menu
// items to the keyboard, making that content unreachable. The render-prop API (children receive a
// `close` to call after an action) is unchanged, so call sites do not change.
export function PopMenu({
  trigger,
  triggerLabel,
  triggerClassName,
  panelClassName,
  align = "left",
  children,
}: PopMenuProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={triggerLabel} className={triggerClassName}>
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
