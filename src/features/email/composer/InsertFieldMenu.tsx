"use client";

// InsertFieldMenu: a shadcn DropdownMenu that inserts a chosen field into the editor at the cursor.
// Generic over the item's inserted value so both consumers reuse it: the composer passes resolved
// field VALUES, the template settings editor passes {{token}} placeholders. Replaces the former
// hand-rolled absolute+mousedown menu (shadcn hard-rule: menus use DropdownMenu).
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface InsertFieldItem {
  label: string;
  value: string;
}

interface InsertFieldMenuProps {
  items: InsertFieldItem[];
  onInsert: (value: string) => void;
  // Trigger label; defaults to "Insert field" (Pipedrive parity copy).
  label?: string;
}

export function InsertFieldMenu({
  items,
  onInsert,
  label = "Insert field",
}: InsertFieldMenuProps): React.ReactNode {
  // Nothing to insert -> render no control (an empty menu is a dead affordance).
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="rounded border border-border px-2 py-1 text-xs transition-transform hover:bg-accent active:scale-[0.96]"
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            className="text-xs"
            onSelect={() => onInsert(item.value)}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
