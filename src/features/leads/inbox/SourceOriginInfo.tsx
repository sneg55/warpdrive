"use client";
import type React from "react";
import { PopMenu } from "./PopMenu";

// Static explanatory popover next to the Source origin header (Pipedrive's source-popover-button).
export function SourceOriginInfo(): React.ReactNode {
  return (
    <PopMenu
      triggerLabel="About source origin"
      triggerClassName="ml-1 inline-flex text-muted-foreground hover:text-foreground"
      panelClassName="w-64 normal-case"
      trigger={
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
      }
    >
      {() => (
        <p className="px-2 py-1 text-xs font-normal text-pretty text-muted-foreground">
          Source origin records how a lead entered warpdrive: manually created, imported, captured
          from a web form, or synced from another channel. It is set when the lead is created and is
          not editable.
        </p>
      )}
    </PopMenu>
  );
}
