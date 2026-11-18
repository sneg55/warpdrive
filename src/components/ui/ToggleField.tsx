"use client";
import type React from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "./Checkbox";
import { INLINE_CONTROL_SURFACE } from "./inlineControlSurface";
import { Switch } from "./Switch";

interface ToggleFieldProps {
  label: string;
  accessibleLabel?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  control?: "checkbox" | "switch";
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

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
