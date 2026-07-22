"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import type React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  // Optional id so a visible <label htmlFor> can forward clicks to this control
  // (restores click-to-toggle on the label text without a wrapping <label>).
  id?: string;
  disabled?: boolean;
  className?: string;
}

// Shadcn-style Radix switch. Radix owns keyboard handling, form behavior, and disabled semantics;
// the track and thumb stay token-styled for the app's compact settings rows.
export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
  className,
}: SwitchProps): React.ReactNode {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-muted-foreground/30 outline-none transition-[background-color,box-shadow,scale] duration-150 ease-out",
        "after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
        "hover:not-disabled:ring-4 hover:not-disabled:ring-ring/15 data-[state=unchecked]:hover:not-disabled:bg-muted-foreground/40",
        "data-[state=checked]:bg-success data-[state=checked]:hover:not-disabled:bg-success/85 motion-safe:active:not-disabled:scale-[0.96] motion-reduce:transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform duration-150 ease-out data-[state=checked]:translate-x-[1.125rem] motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );
}
