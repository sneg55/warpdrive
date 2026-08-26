"use client";
import { Settings } from "lucide-react";
import dynamic from "next/dynamic";
import type React from "react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { type ColumnDef, pinnedKey } from "./columnModel";

// dnd-kit lives behind this boundary. The cog trigger stays in the route bundle so it paints with
// the toolbar; the draggable list is fetched on first open of the popover. ssr:false because the
// list only ever renders inside Radix's client-mounted PopoverContent.
const ColumnsMenuSortableList = dynamic(
  async () => (await import("./ColumnsMenuSortableList")).ColumnsMenuSortableList,
  { ssr: false, loading: () => <div aria-hidden="true" className="min-h-8" /> },
);

export interface ColumnsMenuProps {
  catalog: readonly ColumnDef[];
  order: readonly string[];
  visibleKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onReorder: (from: string, to: string) => void;
}

// Shared "Customize columns" cog menu for any list table. Visible columns render in stored order as
// a draggable list (pinned column first, no handle); hidden columns render below as checkboxes so
// they can be re-added. Built on the shadcn Popover (not DropdownMenu) because the content is
// heterogeneous form-like controls (checkboxes, drag handles) a Radix menu would trap.
export function ColumnsMenu({
  catalog,
  order,
  visibleKeys,
  onToggle,
  onReorder,
}: ColumnsMenuProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const pin = pinnedKey(catalog);
  const hidden = catalog.filter((c) => !visibleKeys.has(c.key));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Customize columns"
        className="rounded-md border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Settings aria-hidden="true" className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="min-w-56 p-1 text-sm">
        <p className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">Columns</p>
        <ColumnsMenuSortableList
          catalog={catalog}
          order={order}
          pinned={pin}
          onToggle={onToggle}
          onReorder={onReorder}
        />
        {hidden.length > 0 ? (
          <>
            <p className="px-2 pt-2 text-xs font-medium uppercase text-muted-foreground">Hidden</p>
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
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
