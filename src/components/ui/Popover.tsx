"use client";
import * as RadixPopover from "@radix-ui/react-popover";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export const PopoverContent = forwardRef<
  React.ElementRef<typeof RadixPopover.Content>,
  React.ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(({ className, align = "start", sideOffset = 4, ...props }, ref) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 rounded-md border bg-popover p-2 text-popover-foreground shadow-md outline-none",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 [transform-origin:var(--radix-popover-content-transform-origin)] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  </RadixPopover.Portal>
));
PopoverContent.displayName = "PopoverContent";
