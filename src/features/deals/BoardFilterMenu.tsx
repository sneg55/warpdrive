"use client";
import type React from "react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Tabs, TabsList } from "@/components/ui/tabs";
import {
  ChevronDown,
  FilterRow,
  FunnelIcon,
  OwnerRow,
  SavedRow,
  type Tab,
  TabButton,
} from "./BoardFilterMenuParts";
import type { BoardOwner } from "./boardFilter";
import type { SavedFilterView as SavedFilter } from "./savedFilterView";

interface BoardFilterMenuProps {
  owners: BoardOwner[];
  selectedOwnerId: string | null;
  // The signed-in user's id, so their row in the Owners list is marked "(my)".
  currentUserId?: string;
  onSelectOwner: (ownerId: string | null) => void;
  // Opens the "Create new filter" modal (Filters tab). Optional so the menu renders standalone.
  onCreateFilter?: () => void;
  savedFilters?: SavedFilter[];
  selectedFilterId?: string | null;
  onSelectFilter?: (filter: SavedFilter | null) => void;
  onToggleFavorite?: (id: string) => void;
}

// The board's filter dropdown (replaces the Everyone/My-deals toggle). A search box plus three
// tabs: Favorites (saved filters starred by the user), Owners (everyone with a deal on this
// board), and Filters (predefined + a create action). Owner filtering is the working core.
// The popover shell (open state, outside-click + Escape dismissal, focus) is the shadcn/Radix
// Popover primitive; the panel holds a search input + Radix Tabs, so Popover (not DropdownMenu)
// is used to avoid trapping keyboard focus in the search box.
export function BoardFilterMenu(props: BoardFilterMenuProps): React.ReactNode {
  const { owners, selectedOwnerId, currentUserId, onSelectOwner, onCreateFilter } = props;
  const { savedFilters = [], selectedFilterId = null, onSelectFilter, onToggleFavorite } = props;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("owners");
  const [query, setQuery] = useState("");

  const triggerLabel =
    selectedOwnerId === null
      ? "Everyone"
      : (owners.find((o) => o.ownerId === selectedOwnerId)?.name ?? "Owner");

  const q = query.trim().toLowerCase();
  const shownOwners = useMemo(
    () => (q === "" ? owners : owners.filter((o) => o.name.toLowerCase().includes(q))),
    [owners, q],
  );
  const shownFilters = useMemo(
    () => (q === "" ? savedFilters : savedFilters.filter((f) => f.name.toLowerCase().includes(q))),
    [savedFilters, q],
  );
  const favorites = useMemo(() => shownFilters.filter((f) => f.favorite), [shownFilters]);

  function pickOwner(ownerId: string | null): void {
    onSelectOwner(ownerId);
    onSelectFilter?.(null);
    setOpen(false);
  }

  function pickFilter(filter: SavedFilter): void {
    onSelectFilter?.(filter);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-sm text-foreground hover:bg-accent"
        >
          <FunnelIcon />
          <span className="max-w-32 truncate">{triggerLabel}</span>
          <ChevronDown />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search owner or filter"
          className="mb-2 w-full rounded-md border px-2.5 py-1.5 text-sm"
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList aria-label="Filter tabs" className="mb-1 border-b">
            <TabButton id="favorites" label="Favorites" />
            <TabButton id="owners" label="Owners" />
            <TabButton id="filters" label="Filters" />
          </TabsList>
        </Tabs>

        <div className="max-h-80 overflow-y-auto py-1">
          {tab === "owners" && (
            <ul>
              <OwnerRow
                name="Everyone"
                selected={selectedOwnerId === null}
                onClick={() => pickOwner(null)}
              />
              {shownOwners.map((o) => (
                <OwnerRow
                  key={o.ownerId}
                  name={o.name}
                  selected={selectedOwnerId === o.ownerId}
                  isCurrentUser={o.ownerId === currentUserId}
                  onClick={() => pickOwner(o.ownerId)}
                />
              ))}
            </ul>
          )}

          {tab === "filters" && (
            <ul>
              <FilterRow
                label="All open deals"
                selected={selectedOwnerId === null && selectedFilterId === null}
                onClick={() => pickOwner(null)}
              />
              {shownFilters.map((f) => (
                <SavedRow
                  key={f.id}
                  filter={f}
                  selected={selectedFilterId === f.id}
                  onPick={() => pickFilter(f)}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onCreateFilter?.();
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-primary hover:bg-accent"
                >
                  <span aria-hidden="true">+</span> Create new filter
                </button>
              </li>
            </ul>
          )}

          {tab === "favorites" &&
            (favorites.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No favorite filters yet. Star a saved filter to see it here.
              </p>
            ) : (
              <ul>
                {favorites.map((f) => (
                  <SavedRow
                    key={f.id}
                    filter={f}
                    selected={selectedFilterId === f.id}
                    onPick={() => pickFilter(f)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </ul>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
