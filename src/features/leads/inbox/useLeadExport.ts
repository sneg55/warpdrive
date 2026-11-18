"use client";
import { useRef, useState } from "react";

const EXPORT_FILENAME = "leads.csv";
const EXPORT_TIMEOUT_MS = 60_000;
export const LEAD_EXPORT_FAILED = "Couldn't export leads. Please try again.";

export interface LeadExport {
  exporting: boolean;
  error: string | null;
  start: (href: string) => Promise<void>;
}

function saveBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = EXPORT_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useLeadExport(): LeadExport {
  const inFlight = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(href: string): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(href, { signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS) });
      if (!res.ok) {
        setError(LEAD_EXPORT_FAILED);
        return;
      }
      saveBlob(await res.blob());
    } catch {
      setError(LEAD_EXPORT_FAILED);
    } finally {
      inFlight.current = false;
      setExporting(false);
    }
  }

  return { exporting, error, start };
}
