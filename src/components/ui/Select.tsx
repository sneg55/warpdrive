"use client";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  group?: string;
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  placeholder?: string;
  triggerClassName?: string;
  triggerContent?: React.ReactNode;
  triggerTitle?: string;
  disabled?: boolean;
}

const EMPTY_SENTINEL = "__empty__";

function toInternal(value: string): string {
  return value === "" ? EMPTY_SENTINEL : value;
}

function fromInternal(value: string): string {
  return value === EMPTY_SENTINEL ? "" : value;
}

interface OptionSection {
  key: string;
  heading: string | undefined;
  options: SelectOption[];
}

function groupOptions(options: SelectOption[]): OptionSection[] {
  const sections: OptionSection[] = [];
  for (const option of options) {
    const last = sections[sections.length - 1];
    if (last !== undefined && last.heading === option.group) {
      last.options.push(option);
      continue;
    }
    sections.push({
      key: option.group ?? `_${option.value}`,
      heading: option.group,
      options: [option],
    });
  }
  return sections;
}

function SelectItem({ option }: { option: SelectOption }): React.ReactNode {
  return (
    <RadixSelect.Item
      value={toInternal(option.value)}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm outline-none transition-colors duration-150",
        "data-[highlighted]:bg-accent data-[state=checked]:font-medium",
      )}
    >
      {option.icon}
      <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator className="ml-auto">
        <Check className="h-4 w-4" />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
}

function SelectSection({
  heading,
  options,
}: {
  heading: string | undefined;
  options: SelectOption[];
}): React.ReactNode {
  if (heading === undefined) {
    return (
      <>
        {options.map((o) => (
          <SelectItem key={o.value} option={o} />
        ))}
      </>
    );
  }
  return (
    <RadixSelect.Group>
      <RadixSelect.Label className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </RadixSelect.Label>
      {options.map((o) => (
        <SelectItem key={o.value} option={o} />
      ))}
    </RadixSelect.Group>
  );
}

function triggerLabel(
  options: SelectOption[],
  value: string,
  placeholder: string,
): React.ReactNode {
  const selected = options.find((o) => o.value === value);
  if (selected !== undefined) return selected.label;
  return <span className="text-muted-foreground">{placeholder}</span>;
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Select",
  triggerClassName,
  triggerContent,
  triggerTitle,
  disabled,
}: SelectProps): React.ReactNode {
  return (
    <RadixSelect.Root
      value={toInternal(value)}
      onValueChange={(v) => onChange(fromInternal(v))}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        title={triggerTitle}
        className={cn(
          "group flex w-full items-center justify-between rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out focus:border-ring focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none",
          triggerClassName,
        )}
      >
        <RadixSelect.Value>
          {triggerContent ?? triggerLabel(options, value, placeholder)}
        </RadixSelect.Value>
        <RadixSelect.Icon>
          <span className="block transition-transform duration-150 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 [transform-origin:var(--radix-select-content-transform-origin)] motion-reduce:animate-none"
        >
          <RadixSelect.Viewport className="p-1">
            {groupOptions(options).map((section) => (
              <SelectSection
                key={section.key}
                heading={section.heading}
                options={section.options}
              />
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
