"use client";
import * as RadixTabs from "@radix-ui/react-tabs";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// SANCTIONED replacement for hand-rolled `role="tablist"` + active-index tab strips.
// Radix brings roving-tabindex keyboard nav (arrows/Home/End), aria wiring, and
// focus management the hand-rolled versions dropped. Default look is the app's
// underline strip; pass className on List/Trigger to match a specific surface
// (e.g. the pill style used on contact/lead timelines).

export const Tabs = RadixTabs.Root;

// The app's two parity-locked tab looks, as TabsTrigger className presets so the
// several strips that share a look stay identical. Active state via data-[state=active].
export const PILL_TAB =
  "rounded-md px-2.5 py-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:font-medium data-[state=active]:text-primary";

// List/Trigger carry only structural + focus/disabled defaults. The app has two
// tab looks (pill and underline) with parity-locked colors, so each surface passes
// its own className and expresses the active state via `data-[state=active]:` utilities
// rather than the old active-index ternary.
export const TabsList = forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(({ className, ...props }, ref) => (
  <RadixTabs.List ref={ref} className={cn("flex items-center", className)} {...props} />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(({ className, ...props }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(({ className, ...props }, ref) => (
  <RadixTabs.Content
    ref={ref}
    className={cn("mt-2 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
