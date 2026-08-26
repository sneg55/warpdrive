"use client";
import type React from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "./Checkbox";
import { INLINE_CONTROL_SURFACE } from "./inlineControlSurface";
import { Switch } from "./Switch";

interface ToggleFieldProps {
  label: string;
  // Accessible name when the visible text is too terse on its own ("Opens" -> "Track opens").
  // Must contain the visible text (WCAG 2.5.3). Defaults to `label`.
  accessibleLabel?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  control?: "checkbox" | "switch";
  disabled?: boolean;
  className?: string;
  // Adornment rendered inside the hover surface but outside the <label>, so clicking it
  // (an info tooltip, say) does not toggle the control.
  children?: React.ReactNode;
}

// A Checkbox or Switch paired with its visible text, as one control: the label forwards clicks
// to the box and the whole thing takes the shared inline hover surface.
export function ToggleField({
  label,
  accessibleLabel,
  checked,
  onCheckedChange,
  control = "checkbox",
  disabled,
  className,
  children,
}: ToggleFieldProps): React.ReactNode {
  const id = useId();
  const name = accessibleLabel ?? label;
  return (
    <span className={cn(INLINE_CONTROL_SURFACE, className)}>
      {control === "switch" ? (
        <Switch
          id={id}
          label={name}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
        />
      ) : (
        <Checkbox
          id={id}
          label={name}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
        />
      )}
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
      {children}
    </span>
  );
}
