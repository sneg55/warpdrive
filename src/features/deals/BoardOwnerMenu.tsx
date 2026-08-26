"use client";
import { ChevronDown } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { OwnerRow } from "./BoardFilterMenuParts";
import type { BoardOwner } from "./boardFilter";

interface BoardOwnerMenuProps {
  owners: BoardOwner[];
  selectedOwnerId: string | null;
  // The signed-in user's id, so their row in the list is marked "(my)".
  currentUserId?: string;
  onSelectOwner: (ownerId: string | null) => void;
}

// The board toolbar's owner picker: everyone with a deal on this board, plus "Everyone". Saved
// filters live in BoardFilterMenu, next to the badge that says the board is filtered.
// The panel holds a search input, so this is a Popover rather than a DropdownMenu (a menu would
// steal the arrow keys and type-ahead from the input).
export function BoardOwnerMenu({
  owners,
  selectedOwnerId,
  currentUserId,
  onSelectOwner,
}: BoardOwnerMenuProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const triggerLabel =
    selectedOwnerId === null
      ? "Everyone"
      : (owners.find((o) => o.ownerId === selectedOwnerId)?.name ?? "Owner");

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q === "" ? owners : owners.filter((o) => o.name.toLowerCase().includes(q))),
    [owners, q],
  );

  function pick(ownerId: string | null): void {
    onSelectOwner(ownerId);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Owner: ${triggerLabel}`}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-sm text-foreground hover:bg-accent"
        >
          <span className="max-w-32 truncate">{triggerLabel}</span>
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search owner"
          className="mb-2 w-full rounded-md border px-2.5 py-1.5 text-sm"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          <OwnerRow
            name="Everyone"
            selected={selectedOwnerId === null}
            onClick={() => pick(null)}
          />
          {shown.map((o) => (
            <OwnerRow
              key={o.ownerId}
              name={o.name}
              selected={selectedOwnerId === o.ownerId}
              isCurrentUser={o.ownerId === currentUserId}
              onClick={() => pick(o.ownerId)}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
