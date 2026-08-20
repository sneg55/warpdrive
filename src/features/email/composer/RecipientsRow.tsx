"use client";
import { useState } from "react";
import { RecipientField } from "./RecipientField";

interface RecipientsRowProps {
  to: string[];
  onToChange: (v: string[]) => void;
  cc: string[];
  onCcChange: (v: string[]) => void;
  bcc: string[];
  onBccChange: (v: string[]) => void;
}

export function RecipientsRow({
  to,
  onToChange,
  cc,
  onCcChange,
  bcc,
  onBccChange,
}: RecipientsRowProps): React.ReactNode {
  const [showCcBcc, setShowCcBcc] = useState(false);
  // Addresses already entered force the rows to stay visible: collapsing them would hide
  // recipients that Send still delivers to. The toggle is therefore only offered while both
  // are empty, so it never becomes an inert control.
  const hasAddresses = cc.length > 0 || bcc.length > 0;
  const expanded = showCcBcc || hasAddresses;

  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        <div className="flex-1">
          <RecipientField label="To" values={to} onChange={onToChange} />
        </div>
        {!hasAddresses && (
          <button
            type="button"
            aria-label="Cc/Bcc"
            aria-expanded={expanded}
            onClick={() => setShowCcBcc((v) => !v)}
            className="ml-2 shrink-0 rounded px-2 py-1 text-xs text-muted-foreground transition-[transform,color,background-color] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cc/Bcc
          </button>
        )}
      </div>
      {expanded && (
        <>
          <RecipientField label="Cc" values={cc} onChange={onCcChange} />
          <RecipientField label="Bcc" values={bcc} onChange={onBccChange} />
        </>
      )}
    </div>
  );
}
