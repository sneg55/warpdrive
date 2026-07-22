"use client";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// SANCTIONED replacement for native `title=` hover hints. Radix gives a styled,
// positioned, theme-aware tooltip with keyboard focus support. Note: unlike the
// native `title` attribute, tooltip content is NOT an accessible name, so an
// icon-only trigger still needs its own aria-label. Use `Tip` for the common
// single-hint case; drop to the compound parts for anything richer.

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export const TooltipContent = forwardRef<
  React.ElementRef<typeof RadixTooltip.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-xs rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground shadow-md",
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 [transform-origin:var(--radix-tooltip-content-transform-origin)] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  </RadixTooltip.Portal>
));
TooltipContent.displayName = "TooltipContent";

interface TipProps {
  // The hint text. Also set aria-label on the child yourself when the trigger has
  // no visible text (icon-only), since tooltip content is a description, not a name.
  label: React.ReactNode;
  children: React.ReactNode;
  side?: React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>["side"];
}

// Convenience wrapper for the common native-title migration: one hint, one trigger.
// Self-provides a TooltipProvider (shadcn's current pattern) so a <Tip> works anywhere,
// including components rendered in isolation under test, without a global provider.
export function Tip({ label, children, side }: TipProps): React.ReactNode {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
