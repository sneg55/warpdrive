"use client";
import type React from "react";
import { useState } from "react";

export function ComposerDisclosureField({
  label,
  hasValue,
  children,
}: {
  label: string;
  hasValue: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  const [open, setOpen] = useState(hasValue);
  if (open) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="text-primary transition-transform hover:opacity-90 active:scale-[0.96]"
    >
      {label}
    </button>
  );
}
