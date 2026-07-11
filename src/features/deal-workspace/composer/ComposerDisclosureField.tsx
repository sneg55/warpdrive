"use client";
import type React from "react";
import { useState } from "react";

// Pipedrive-style optional composer field: shows a "[label]" link until clicked, then reveals the
// field inline. Starts open when the field already carries a value (e.g. after Duplicate) so set
// data is never hidden. Mounts inside a ComposerFieldRow, so the row's leading icon stays visible
// in both states, matching PD's Guests/Location/Video call/Description link rows.
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
