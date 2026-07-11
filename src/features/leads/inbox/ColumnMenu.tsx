"use client";
import dynamic from "next/dynamic";
import type React from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { LEAD_COLUMNS } from "./columns";
import { PopMenu } from "./PopMenu";

// dnd-kit lives behind this boundary. The cog trigger stays in the /leads bundle so it paints with
// the toolbar; the draggable list is fetched on first open of the menu.
const ColumnMenuSortableList = dynamic(
  async () => (await import("./ColumnMenuSortableList")).ColumnMenuSortableList,
  { ssr: false, loading: () => <div aria-hidden="true" className="min-h-8" /> },
);

export interface ColumnMenuProps {
  order: readonly string[];
  visibleKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onReorder: (from: string, to: string) => void;
}

// Header cog menu: visible columns render in stored order as a draggable list (Title pinned first,
// no handle); hidden columns render below as static checkboxes so they can be re-added.
export function ColumnMenu({
  order,
  visibleKeys,
  onToggle,
  onReorder,
}: ColumnMenuProps): React.ReactNode {
  const hidden = LEAD_COLUMNS.filter((c) => !visibleKeys.has(c.key));

  return (
    <PopMenu
      triggerLabel="Customize columns"
      triggerClassName="rounded-md border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      align="right"
      panelClassName="min-w-56"
      trigger={
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M19.14 12.94a7.5 7.5 0 0 0 .05-1.88l2-1.56-2-3.46-2.36.96a7.3 7.3 0 0 0-1.62-.94L14.9 2h-4l-.31 2.06a7.3 7.3 0 0 0-1.62.94L6.6 4.04l-2 3.46 2 1.56a7.5 7.5 0 0 0 0 1.88l-2 1.56 2 3.46 2.36-.96c.5.4 1.04.72 1.62.94l.31 2.06h4l.31-2.06c.58-.22 1.12-.54 1.62-.94l2.36.96 2-3.46-2-1.56zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
        </svg>
      }
    >
      {() => (
        <div>
          <p className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">Columns</p>
          <ColumnMenuSortableList order={order} onToggle={onToggle} onReorder={onReorder} />
          {hidden.length > 0 && (
            <>
              <p className="px-2 pt-2 text-xs font-medium uppercase text-muted-foreground">
                Hidden
              </p>
              {hidden.map((col) => (
                <div
                  key={col.key}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                >
                  <span className="w-4" aria-hidden="true" />
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => onToggle(col.key)}
                    label={col.header}
                  />
                  <span>{col.header}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </PopMenu>
  );
}
