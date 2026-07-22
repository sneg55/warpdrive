"use client";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { Check, ChevronsUpDown, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./Button";
import type { ComboboxOption } from "./Combobox";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

interface MultiComboboxProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: ComboboxOption[];
  ariaLabel: string;
  placeholder?: string;
}

// Searchable multi-select (participants/guests picker). Popover + cmdk, mirroring
// Combobox but for many values: selected options render as removable chips and each
// list row toggles membership. Chips carry their own remove buttons and live as
// siblings of the trigger button (never nested inside it) so the markup stays valid.
export function MultiCombobox({
  values,
  onChange,
  options,
  ariaLabel,
  placeholder = "Select",
}: MultiComboboxProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => values.includes(o.value));

  function toggle(value: string): void {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-auto min-h-9 w-full flex-wrap justify-start gap-1 py-1 font-normal",
        )}
      >
        {selected.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
          >
            {o.avatarName !== undefined && (
              <Avatar name={o.avatarName} src={o.avatarUrl} className="h-4 w-4 text-[9px]" />
            )}
            {o.label}
            <button
              type="button"
              aria-label={`Remove ${o.label}`}
              onClick={() => toggle(o.value)}
              className="relative rounded text-muted-foreground transition-[color,scale] duration-150 ease-out after:absolute after:-inset-1.5 after:content-[''] hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <PopoverTrigger
          aria-label={ariaLabel}
          className="flex flex-1 items-center justify-between gap-1 self-stretch text-left outline-none"
        >
          {values.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
      </div>
      <PopoverContent className="p-0">
        <Command>
          <CommandInput
            placeholder="Search..."
            className="w-full border-b px-2.5 py-2 text-sm outline-none"
          />
          <CommandList className="max-h-56 overflow-y-auto p-1">
            <CommandEmpty className="px-2 py-3 text-sm text-muted-foreground">
              No match.
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => toggle(o.value)}
                  className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                >
                  {o.avatarName !== undefined && (
                    <Avatar name={o.avatarName} src={o.avatarUrl} className="h-5 w-5 text-[10px]" />
                  )}
                  {o.label}
                  {values.includes(o.value) && <Check className="ml-auto h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
