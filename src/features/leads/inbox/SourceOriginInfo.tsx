"use client";
import { Info } from "lucide-react";
import type React from "react";
import { PopMenu } from "./PopMenu";

// Static explanatory popover next to the Source origin header (Pipedrive's source-popover-button).
export function SourceOriginInfo(): React.ReactNode {
  return (
    <PopMenu
      triggerLabel="About source origin"
      triggerClassName="ml-1 inline-flex text-muted-foreground hover:text-foreground"
      panelClassName="w-64 normal-case"
      trigger={<Info aria-hidden="true" className="h-3.5 w-3.5" />}
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
