"use client";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean | "indeterminate";
  onCheckedChange: (v: boolean) => void;
  // Accessible name. The box renders no text of its own, so a caller that wants a VISIBLE label
  // passes `id` too and renders its own <label htmlFor>.
  label: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

// Branded checkbox (Radix), the design-system replacement for native <input type=checkbox>.
// Supports the "indeterminate" (mixed) state used by table select-all headers. Token-styled to
// match the rest of the UI: on = primary fill with a check, indeterminate = primary fill with a
// minus. `onCheckedChange` collapses Radix's boolean|"indeterminate" to a plain boolean at the
// one boundary callers observe (a click on an indeterminate box resolves to checked=true).
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
  className,
}: CheckboxProps): React.ReactNode {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "peer relative h-4 w-4 shrink-0 rounded-sm border border-input transition-[background-color,border-color,color,scale] duration-150 ease-out",
        "after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
        "motion-safe:active:not-disabled:scale-[0.96] motion-reduce:transition-colors",
        "data-[state=unchecked]:hover:border-primary/60 data-[state=unchecked]:hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
    >
      <CheckboxPrimitive.Indicator
        forceMount
        className="relative flex items-center justify-center text-current"
      >
        <span
          className={cn(
            "flex items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-opacity",
            checked === true ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
          )}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-opacity",
            checked === "indeterminate"
              ? "scale-100 opacity-100 blur-0"
              : "scale-[0.25] opacity-0 blur-[4px]",
          )}
        >
          <Minus className="h-3 w-3" strokeWidth={3} />
        </span>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
