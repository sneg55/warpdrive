"use client";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import type React from "react";
import { forwardRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./Button";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

export interface ComboboxOption {
  value: string;
  label: string;
  avatarName?: string;
  avatarUrl?: string | null;
  group?: string;
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
  // Overrides on the trigger, mirroring Select's triggerClassName. The trigger defaults to w-full,
  // which a caller in a flex row has to be able to override.
  triggerClassName?: string;
  disabled?: boolean;
}

interface ComboboxGroup {
  heading: string | undefined;
  options: ComboboxOption[];
}

function matchLabel(_value: string, search: string, keywords?: string[]): number {
  const label = keywords?.[0] ?? "";
  return label.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
}

function groupOptions(options: ComboboxOption[]): ComboboxGroup[] {
  const groups: ComboboxGroup[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last !== undefined && last.heading === option.group) {
      last.options.push(option);
      continue;
    }
    groups.push({ heading: option.group, options: [option] });
  }
  return groups;
}

// Searchable single-select with avatars (owner/assignee picker). Popover + cmdk.
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  {
    value,
    onChange,
    options,
    ariaLabel,
    placeholder = "Select",
    footer,
    triggerClassName,
    disabled = false,
    ...triggerProps
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const groups = groupOptions(options);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        {...triggerProps}
        ref={ref}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full justify-between font-normal disabled:opacity-50",
          triggerClassName,
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
        <Command filter={matchLabel}>
          <CommandInput
            placeholder="Search..."
            className="w-full border-b px-2.5 py-2 text-sm outline-none"
          />
          <CommandList className="max-h-56 overflow-y-auto p-1">
            <CommandEmpty className="px-2 py-3 text-sm text-muted-foreground">
              No match.
            </CommandEmpty>
            {groups.map((g) => (
              <CommandGroup
                key={g.options[0]?.value ?? g.heading}
                heading={g.heading}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {g.options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    keywords={[o.label]}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                  >
                    {o.avatarName !== undefined && (
                      <Avatar
                        name={o.avatarName}
                        src={o.avatarUrl}
                        className="h-5 w-5 text-[10px]"
                      />
                    )}
                    {o.label}
                    {o.value === value && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {footer !== undefined && <div className="border-t p-1">{footer(() => setOpen(false))}</div>}
      </PopoverContent>
    </Popover>
  );
});
