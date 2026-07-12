"use client";

// InsertFieldMenu: a searchable, entity-tabbed field picker that inserts a chosen field into the
// editor at the cursor (PD parity: PD's "Insert field" is a search box + category tabs over the
// field list, with an "Update autofilled values" action). Built on the sanctioned Popover + cmdk
// Command primitives (same as Combobox), NOT a hand-rolled menu. Generic over the inserted value so
// both consumers reuse it: the composer passes resolved field VALUES, the template settings editor
// passes {{token}} placeholders.
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

export interface InsertFieldItem {
  label: string;
  value: string;
  // Entity the field belongs to (Person / Deal / Organization), drives the category tabs.
  category?: string;
}

interface InsertFieldMenuProps {
  items: InsertFieldItem[];
  onInsert: (value: string) => void;
  // Trigger label; defaults to "Insert field" (Pipedrive parity copy).
  label?: string;
  // When provided (deal context with live-resolved values), shows PD's "Update autofilled values".
  onRefresh?: () => void;
}

export function InsertFieldMenu({
  items,
  onInsert,
  label = "Insert field",
  onRefresh,
}: InsertFieldMenuProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  // Active category tab; null = All.
  const [tab, setTab] = useState<string | null>(null);
  // Nothing to insert -> render no control (an empty menu is a dead affordance).
  if (items.length === 0) return null;
  const categories = [
    ...new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c))),
  ];
  const shown = tab === null ? items : items.filter((i) => i.category === tab);
  const tabClass = (active: boolean): string =>
    cn(
      "rounded px-2 py-0.5 text-xs transition-colors",
      active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent",
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className="rounded border border-border px-2 py-1 text-xs transition-transform hover:bg-accent active:scale-[0.96]"
      >
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          <CommandInput
            placeholder="Search fields..."
            className="w-full border-b px-2.5 py-2 text-sm outline-none"
          />
          {categories.length > 1 && (
            <div role="tablist" className="flex flex-wrap gap-1 border-b px-1 py-1">
              <button
                type="button"
                role="tab"
                aria-selected={tab === null}
                className={tabClass(tab === null)}
                onClick={() => setTab(null)}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={tab === c}
                  className={tabClass(tab === c)}
                  onClick={() => setTab(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <CommandList className="max-h-56 overflow-y-auto p-1">
            <CommandEmpty className="px-2 py-3 text-sm text-muted-foreground">
              No match.
            </CommandEmpty>
            <CommandGroup>
              {shown.map((item) => (
                <CommandItem
                  key={item.label}
                  value={item.label}
                  onSelect={() => {
                    onInsert(item.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer rounded px-2 py-1.5 text-xs data-[selected=true]:bg-accent"
                >
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {onRefresh !== undefined && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => onRefresh()}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              <span aria-hidden="true">↻</span> Update autofilled values
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
