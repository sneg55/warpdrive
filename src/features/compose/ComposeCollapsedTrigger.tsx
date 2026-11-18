"use client";
import type React from "react";

interface Props {
  label: string;
  onExpand: () => void;
  onPreload?: () => void;
}

export function ComposeCollapsedTrigger({ label, onExpand, onPreload }: Props): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onExpand}
      onMouseEnter={onPreload}
      onFocus={onPreload}
      className="flex h-[60px] w-full items-center pl-4 text-start text-sm font-[450] text-muted-foreground"
    >
      {label}
    </button>
  );
}
