"use client";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./Button";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

export interface ComboboxOption {
  value: string;
  label: string;
  avatarName?: string;
  avatarUrl?: string | null;
}

interface ComboboxProps {
  value: string;
  onChange: (v: string) => void;
  options: ComboboxOption[];
  ariaLabel: string;
  placeholder?: string;
  // Optional actions rendered below the option list (e.g. "Save as template" / "Manage templates").
  // Receives a `close` callback so an action can dismiss the popover.
  footer?: (close: () => void) => React.ReactNode;
}

// Searchable single-select with avatars (owner/assignee picker). Popover + cmdk.
export function Combobox({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Select",
  footer,
}: ComboboxProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full justify-between font-normal",
        )}
      >
        <span className="flex items-center gap-1.5 truncate">
          {selected?.avatarName !== undefined && (
            <Avatar
              name={selected.avatarName}
              src={selected.avatarUrl}
              className="h-5 w-5 text-[10px]"
            />
          )}
          {selected?.label ?? <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
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
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                >
                  {o.avatarName !== undefined && (
                    <Avatar name={o.avatarName} src={o.avatarUrl} className="h-5 w-5 text-[10px]" />
                  )}
                  {o.label}
                  {o.value === value && <Check className="ml-auto h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {footer !== undefined && <div className="border-t p-1">{footer(() => setOpen(false))}</div>}
      </PopoverContent>
    </Popover>
  );
}
