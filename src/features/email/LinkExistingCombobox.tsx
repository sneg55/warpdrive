"use client";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { Search } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";

const S = STRINGS.inbox;

interface LinkExistingComboboxProps {
  kind: "person" | "deal";
  triggerLabel: string;
  onPick: (id: string) => void;
}

// Search-as-you-type picker that links the thread to an existing person or deal. Backed by the
// global search procedure (trpc.search.query), which returns results grouped by kind; this reads
// only the group matching `kind` so the contact card never offers a deal and vice versa. Built on
// the shadcn Popover + cmdk Command primitives (server does the filtering, so shouldFilter=false).
export function LinkExistingCombobox({
  kind,
  triggerLabel,
  onPick,
}: LinkExistingComboboxProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  // 150ms debounce so each keystroke does not fire a search request (mirrors CommandPalette).
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(id);
  }, [q]);

  const { data } = trpc.search.query.useQuery(
    { q: debounced },
    { enabled: debounced.trim().length > 0 },
  );

  const items = kind === "person" ? (data?.people ?? []) : (data?.deals ?? []);
  const placeholder = kind === "person" ? S.searchPeoplePlaceholder : S.searchDealsPlaceholder;
  const showList = debounced.trim().length > 0;

  function pick(id: string): void {
    onPick(id);
    setOpen(false);
    setQ("");
    setDebounced("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full justify-start gap-1.5 font-normal text-muted-foreground",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder={placeholder}
            className="w-full border-b px-2.5 py-2 text-sm outline-none"
          />
          <CommandList className="max-h-56 overflow-y-auto p-1">
            {showList && (
              <CommandEmpty className="px-2 py-3 text-sm text-muted-foreground">
                {S.noMatches}
              </CommandEmpty>
            )}
            {showList && (
              <CommandGroup>
                {items.map((it) => (
                  <CommandItem
                    key={it.id}
                    value={it.id}
                    onSelect={() => pick(it.id)}
                    className="flex cursor-pointer flex-col items-start gap-0.5 rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                  >
                    <span className="truncate">{it.primary}</span>
                    {it.secondary !== null && it.secondary !== "" && (
                      <span className="truncate text-xs text-muted-foreground">{it.secondary}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
