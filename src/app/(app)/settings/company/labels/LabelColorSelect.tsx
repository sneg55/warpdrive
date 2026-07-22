"use client";
import type React from "react";
import { Select } from "@/components/ui/Select";
import { LABEL_COLORS, LABEL_DOT_CLASSES, type LabelColor } from "@/constants/labelColors";

const LABEL_COLOR_OPTIONS = LABEL_COLORS.map((color) => ({
  value: color,
  label: color,
  icon: (
    <span
      aria-hidden="true"
      className={`inline-block size-3 rounded-full ${LABEL_DOT_CLASSES[color]}`}
    />
  ),
}));

interface LabelColorSelectProps {
  ariaLabel: string;
  value: LabelColor;
  onChange: (color: LabelColor) => void;
}

// One color picker for both existing-label rows and add-label forms. Keeping the options and
// Radix Select invocation here prevents the two surfaces from drifting in menu content or style.
export function LabelColorSelect({
  ariaLabel,
  value,
  onChange,
}: LabelColorSelectProps): React.ReactNode {
  return (
    <Select
      ariaLabel={ariaLabel}
      value={value}
      onChange={(next) => onChange(next as LabelColor)}
      options={LABEL_COLOR_OPTIONS}
    />
  );
}
