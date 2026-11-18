"use client";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface InsertFieldItem {
  label: string;
  value: string;
  category?: string;
}

interface InsertFieldMenuProps {
  items: InsertFieldItem[];
  onInsert: (value: string) => void;
  label?: string;
  onRefresh?: () => void;
}

const ALL_TAB = "__all__";
const CATEGORY_TAB =
  "rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium";

export function InsertFieldMenu({
  items,
  onInsert,
  label = "Insert field",
  onRefresh,
}: InsertFieldMenuProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  if (items.length === 0) return null;
  const categories = [
    ...new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c))),
  ];
  const shown = tab === null ? items : items.filter((i) => i.category === tab);
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
            <Tabs value={tab ?? ALL_TAB} onValueChange={(v) => setTab(v === ALL_TAB ? null : v)}>
              <TabsList className="flex-wrap gap-1 border-b px-1 py-1">
                <TabsTrigger value={ALL_TAB} className={CATEGORY_TAB}>
                  All
                </TabsTrigger>
                {categories.map((c) => (
                  <TabsTrigger key={c} value={c} className={CATEGORY_TAB}>
                    {c}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
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
