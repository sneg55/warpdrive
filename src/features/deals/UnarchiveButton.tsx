"use client";

import { LoaderCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";

export function UnarchiveButton({
  onUnarchive,
}: {
  onUnarchive: () => Promise<boolean>;
}): React.ReactNode {
  const [busy, setBusy] = useState(false);

  async function run(): Promise<void> {
    setBusy(true);
    try {
      await onUnarchive();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      aria-label={busy ? "Unarchiving" : "Unarchive"}
      onClick={() => void run()}
      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
    >
      {busy && (
        <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:hidden" />
      )}
      {busy ? "Unarchiving…" : "Unarchive"}
    </button>
  );
}
