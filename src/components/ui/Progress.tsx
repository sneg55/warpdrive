"use client";
import * as RadixProgress from "@radix-ui/react-progress";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ProgressProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RadixProgress.Root>, "value" | "max"> {
  value: number;
  max?: number;
  label: string;
  indicatorClassName?: string;
}

export const Progress = forwardRef<React.ElementRef<typeof RadixProgress.Root>, ProgressProps>(
  ({ value, max = 100, label, className, indicatorClassName, ...props }, ref) => {
    const safeMax = max > 0 ? max : 100;
    const clamped = Math.min(Math.max(value, 0), safeMax);
    const remaining = 100 - (clamped / safeMax) * 100;
    return (
      <RadixProgress.Root
        ref={ref}
        value={clamped}
        max={safeMax}
        aria-label={label}
        className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
        {...props}
      >
        <RadixProgress.Indicator
          className={cn(
            "h-full w-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none",
            indicatorClassName,
          )}
          style={{ transform: `translateX(-${remaining}%)` }}
        />
      </RadixProgress.Root>
    );
  },
);
Progress.displayName = "Progress";
