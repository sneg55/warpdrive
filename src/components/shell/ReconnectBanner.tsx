"use client";

import type React from "react";
import { STRINGS } from "@/constants/strings";

export function ReconnectBanner({ visible = false }: { visible?: boolean }): React.ReactNode {
  if (visible === false) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-warning px-4 py-1 text-center text-xs text-warning-foreground"
    >
      {STRINGS.reconnect.reconnecting}
    </div>
  );
}
