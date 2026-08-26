"use client";
import type React from "react";
import { useEffect, useRef } from "react";
import type { DayButtonProps } from "react-day-picker";
import { cn } from "@/lib/utils";
import { toYmd } from "./dateFormat";
import { Tip } from "./tooltip";

export interface DayAccessory {
  indicator: React.ReactNode;
  hint: string;
}

function nameIncludingHint(dayLabel: string | undefined, hint: string): string {
  return `${dayLabel ?? ""}, ${hint}`;
}

export function dayAccessoryButton(
  accessoryFor: (ymd: string) => DayAccessory | null,
): (props: DayButtonProps) => React.ReactElement {
  return function DayAccessoryButton({ day, modifiers, className, children, ...buttonProps }) {
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      if (modifiers.focused === true) ref.current?.focus();
    }, [modifiers.focused]);
    const accessory = accessoryFor(toYmd(day.date));
    const button = (
      <button
        ref={ref}
        type="button"
        className={cn("relative", className)}
        {...buttonProps}
        aria-label={
          accessory === null
            ? buttonProps["aria-label"]
            : nameIncludingHint(buttonProps["aria-label"], accessory.hint)
        }
      >
        {children}
        {accessory !== null ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0.5 flex justify-center">
            {accessory.indicator}
          </span>
        ) : null}
      </button>
    );
    if (accessory === null) return button;
    return <Tip label={accessory.hint}>{button}</Tip>;
  };
}
