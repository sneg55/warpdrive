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

  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        <div className="flex-1">
          <RecipientField label="To" values={to} onChange={onToChange} />
        </div>
        {!showCcBcc && (
          <button
            type="button"
            aria-label="Cc/Bcc"
            onClick={() => setShowCcBcc(true)}
            className="ml-2 shrink-0 rounded px-2 py-1 text-xs text-muted-foreground transition-[transform,color,background-color] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cc/Bcc
          </button>
        )}
      </div>
      {showCcBcc && (
        <>
          <RecipientField label="Cc" values={cc} onChange={onCcChange} />
          <RecipientField label="Bcc" values={bcc} onChange={onBccChange} />
        </>
      )}
    </div>
  );
}
