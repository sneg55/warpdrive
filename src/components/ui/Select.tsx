"use client";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  // Heading this option sits under. Consecutive options sharing a group render inside one
  // RadixSelect.Group with a sticky label, which is how the import map step separates
  // "Lead" fields from "Organization" fields in one picker.
  group?: string;
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  placeholder?: string;
  // Override/extend the trigger classes (twMerge dedupes), e.g. to drop the border and bg when
  // the select is composed inside a larger segmented control.
  triggerClassName?: string;
  // Custom content to show in the trigger instead of the selected option's label (e.g. a
  // static icon for a compact icon-only trigger). Radix's SelectValue portals the selected
  // item's label into the trigger only when it has no children of its own, so passing
  // children here switches the trigger to always showing this content regardless of
  // selection. Omitting it (the default for all existing callers) keeps the label portal,
  // so behavior is unchanged.
  triggerContent?: React.ReactNode;
  // Native hover tooltip on the trigger, for icon-only triggers that need a title alongside
  // ariaLabel (mirrors the title on other icon-only controls). Omitted by default.
  triggerTitle?: string;
}

// Radix reserves value="" on RadixSelect.Item/Root to mean "nothing selected, show the
// placeholder": when the controlled value is "", it shows the placeholder text instead of the
// matching option's label, and swallows re-selecting that option. Many callers pass a real
// business option with value: "" (priority "None", org "No organization", owner "Me", ...), so
// we map "" to this internal sentinel wherever Radix sees a value, and decode it back to "" at
// the one boundary callers observe (onChange). No real option value should ever equal this.
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

// Collapse the flat option list into consecutive runs sharing a `group`. Ungrouped options render
// without a heading, so a caller that never sets `group` gets exactly the previous markup.
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

// Branded single-select (Radix), the design-system replacement for a native
// <select>. Supports an optional leading icon per option (activity type picker).
export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Select",
  triggerClassName,
  triggerContent,
  triggerTitle,
}: SelectProps): React.ReactNode {
  return (
    <RadixSelect.Root value={toInternal(value)} onValueChange={(v) => onChange(fromInternal(v))}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        title={triggerTitle}
        className={cn(
          "group flex w-full items-center justify-between rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out focus:border-ring focus:ring-2 focus:ring-ring/50 motion-reduce:transition-none",
          triggerClassName,
        )}
      >
        <RadixSelect.Value placeholder={placeholder}>{triggerContent}</RadixSelect.Value>
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
