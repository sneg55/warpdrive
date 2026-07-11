"use client";
import { Filter } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { HideEmptyContext } from "./sidebar/sectionFilter";

// A titled, collapsible sidebar section (Pipedrive's deal detail groups Summary/Details/Source/
// etc. as collapsible cards). Defaults open; the header toggles visibility. The funnel button
// hides value-less FieldRows via HideEmptyContext (pixel-parity fix 2).
export function CollapsibleSection({
  title,
  defaultOpen = true,
  headerActions,
  showFilter = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  headerActions?: (ctx: { hideEmpty: boolean; showEmptyFields: () => void }) => React.ReactNode;
  // PD's Summary header carries only the kebab (no hide-empty funnel: its action-list rows are
  // never empty), so that section opts out of the filter toggle.
  showFilter?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  const [open, setOpen] = useState(defaultOpen);
  const [hideEmpty, setHideEmpty] = useState(false);
  return (
    <section aria-label={title} className="overflow-hidden rounded-md border bg-card">
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 px-3 py-2 text-base font-semibold text-foreground hover:bg-accent/50"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          {title}
        </button>
        {showFilter && (
          <button
            type="button"
            aria-label="Hide empty fields"
            aria-pressed={hideEmpty}
            onClick={() => setHideEmpty((v) => !v)}
            className={
              hideEmpty
                ? "rounded p-1 text-primary hover:bg-accent"
                : "rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            }
          >
            <Filter aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
        {headerActions?.({ hideEmpty, showEmptyFields: () => setHideEmpty(false) })}
      </div>
      {open && (
        <div className="border-t px-3 py-2">
          <HideEmptyContext.Provider value={hideEmpty}>{children}</HideEmptyContext.Provider>
        </div>
      )}
    </section>
  );
}
