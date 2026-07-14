import type React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { SavedFilterView as SavedFilter } from "./savedFilterView";

export type Tab = "favorites" | "owners" | "filters";

// Rendered inside the menu's <Tabs>/<TabsList>; Radix drives the active state.
export function TabButton({ id, label }: { id: Tab; label: string }): React.ReactNode {
  return (
    <TabsTrigger
      value={id}
      className="flex-1 border-b-2 border-transparent px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-foreground"
    >
      {label}
    </TabsTrigger>
  );
}

export function OwnerRow({
  name,
  selected,
  isCurrentUser = false,
  onClick,
}: {
  name: string;
  selected: boolean;
  // Marks the row for the signed-in user so it reads as "Name (my)" (Pipedrive convention).
  isCurrentUser?: boolean;
  onClick: () => void;
}): React.ReactNode {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
          selected && "bg-accent font-medium",
        )}
      >
        <Avatar name={name} className="h-5 w-5 text-[10px]" />
        <span className="truncate">{name}</span>
        {isCurrentUser && <span className="shrink-0 text-muted-foreground">(my)</span>}
      </button>
    </li>
  );
}

export function SavedRow({
  filter,
  selected,
  onPick,
  onToggleFavorite,
}: {
  filter: SavedFilter;
  selected: boolean;
  onPick: () => void;
  onToggleFavorite?: (id: string) => void;
}): React.ReactNode {
  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "flex flex-1 items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent",
          selected && "bg-accent font-medium",
        )}
      >
        <span className="truncate">{filter.name}</span>
      </button>
      {/* Only the owner can toggle the favorite (it is a per-row, owner-scoped flag), so the
          star is shown as an interactive control only for owned filters. */}
      {filter.isOwn && (
        <button
          type="button"
          aria-label={filter.favorite ? "Unfavorite filter" : "Favorite filter"}
          aria-pressed={filter.favorite}
          onClick={() => onToggleFavorite?.(filter.id)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span aria-hidden="true">{filter.favorite ? "★" : "☆"}</span>
        </button>
      )}
    </li>
  );
}

export function FilterRow({
  label,
  selected = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
}): React.ReactNode {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent",
          selected && "bg-accent font-medium",
        )}
      >
        {label}
      </button>
    </li>
  );
}

export function FunnelIcon(): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </svg>
  );
}

export function ChevronDown(): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
