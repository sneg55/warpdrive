"use client";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { Check } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { LABEL_DOT_CLASSES } from "@/constants/labelColors";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { createMailLabelAction } from "./mailLabelsActions";

// Default color applied to an inline-created mail label (Gmail assigns one automatically; recoloring
// lives in a later settings surface). Kept as a named constant, not a magic string.
const DEFAULT_NEW_LABEL_COLOR = "blue" as const;

interface MailLabelPickerProps {
  // Applied catalog keys (built-in tokens or custom slugs), as stored on email_threads.labels[].
  value: string[];
  onChange: (keys: string[]) => void;
}

// Searchable mail-label picker with inline create (inbox parity U6). Lists the mail-label catalog,
// toggles membership by key, and offers "Create <term>" when the search matches no existing label.
// cmdk + Popover (the sanctioned shadcn combobox stack, mirroring MultiCombobox); own filtering so
// the create row survives an empty result set.
export function MailLabelPicker({ value, onChange }: MailLabelPickerProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const catalog = trpc.mailLabels.list.useQuery().data ?? [];
  const utils = trpc.useUtils();

  const term = search.trim();
  const filtered = catalog.filter((l) => l.name.toLowerCase().includes(term.toLowerCase()));
  const exactMatch = catalog.some((l) => l.name.toLowerCase() === term.toLowerCase());
  const showCreate = term !== "" && !exactMatch;

  function toggle(key: string): void {
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  }

  async function handleCreate(name: string): Promise<void> {
    setError(null);
    const res = await createMailLabelAction(readCsrfToken(), {
      name,
      color: DEFAULT_NEW_LABEL_COLOR,
    });
    if (!res.ok) {
      setError(STRINGS.inbox.errorCreateLabel);
      return;
    }
    await utils.mailLabels.list.invalidate();
    if (!value.includes(res.value.key)) onChange([...value, res.value.key]);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-muted-foreground hover:border-gray-400 hover:text-foreground">
        {STRINGS.inbox.addLabel}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command shouldFilter={false} aria-label={STRINGS.inbox.addLabel}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={STRINGS.inbox.searchOrCreateLabel}
            className="w-full border-b px-2.5 py-2 text-sm outline-none"
          />
          <CommandList className="max-h-56 overflow-y-auto p-1">
            <CommandGroup>
              {filtered.map((label) => (
                <CommandItem
                  key={label.key}
                  value={label.key}
                  onSelect={() => toggle(label.key)}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LABEL_DOT_CLASSES[label.color]}`}
                  />
                  {label.name}
                  {value.includes(label.key) && <Check className="ml-auto h-4 w-4" />}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={`__create__${term}`}
                  onSelect={() => void handleCreate(term)}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground data-[selected=true]:bg-accent"
                >
                  {STRINGS.inbox.createLabel(term)}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
          {error !== null && <p className="px-2.5 pb-2 text-xs text-destructive">{error}</p>}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
