"use client";
import { ChevronDown, Filter } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DeleteSavedFilterConfirm,
  type PendingFilterDelete,
} from "@/features/saved-filters/SavedFilterDelete";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { cn } from "@/lib/utils";
import { SavedFilterItem } from "./BoardFilterMenuParts";
import { filterSaveCopy, filterSaveMode } from "./createFilterModalCopy";
import { truncateFilterName } from "./filterTriggerCopy";
import type { SavedFilterView as SavedFilter } from "./savedFilterView";

interface BoardFilterMenuProps {
  savedFilters?: SavedFilter[];
  selectedFilterId?: string | null;
  // The ad-hoc definition applied to the board. It leaves selectedFilterId null too, so the
  // "All open deals" row is current only when both are empty.
  appliedDefinition?: FilterDefinition | null;
  // Number of applied ad-hoc conditions, for the trigger badge (0 hides it).
  activeCount?: number;
  // Trigger copy. The deals list keeps its own ad-hoc builder, so there its menu is only the
  // saved-filter picker and says so.
  triggerLabel?: string;
  // True when the board is also narrowed to one owner. That picker is a separate control, so
  // without this the trigger reads unfiltered and clearing would leave the board filtered.
  ownerFiltered?: boolean;
  onSelectFilter?: (filter: SavedFilter | null) => void;
  // Drops any applied ad-hoc definition, so clearing leaves nothing filtering the board.
  onClearConditions?: () => void;
  // Resets the owner picker, so "Clear filter" clears every dimension narrowing the board.
  onClearOwner?: () => void;
  onToggleFavorite?: (id: string) => void;
  // Removes an owned saved filter, once the user has confirmed it. Omit to offer no delete.
  onDeleteFilter?: (id: string) => void;
  // Opens the create/edit filter dialog.
  onCreateFilter?: () => void;
}

// The board toolbar's Filter control: the badge that says the board is filtered, the saved
// filters, the create/edit entry and the action that clears the filter, in one menu. A list of
// rows plus actions, so it is the shadcn/Radix DropdownMenu primitive.
export function BoardFilterMenu(props: BoardFilterMenuProps): React.ReactNode {
  const { savedFilters = [], selectedFilterId = null, appliedDefinition = null } = props;
  const { activeCount = 0, triggerLabel = "Filter", onSelectFilter, onClearConditions } = props;
  const { onToggleFavorite, onDeleteFilter, onCreateFilter } = props;
  const { ownerFiltered = false, onClearOwner } = props;
  const [pendingDelete, setPendingDelete] = useState<PendingFilterDelete | null>(null);

  const filtered = selectedFilterId !== null || appliedDefinition !== null || ownerFiltered;
  // Board filter state survives a reload, so the trigger is the only thing that can explain why
  // the board is showing a subset. Name the applied filter rather than a bare "Filter", but only
  // when it is the one filtering: callers resolve `inlineDefinition ?? savedFilter?.definition`,
  // so an ad-hoc definition overrides the selection and naming it then would be wrong.
  const appliedName =
    appliedDefinition === null
      ? savedFilters.find((f) => f.id === selectedFilterId)?.name
      : undefined;
  const triggerCopy = appliedName === undefined ? triggerLabel : `${triggerLabel}: ${appliedName}`;
  // A name is valid up to 120 chars and the trigger never wraps, so the visible copy is capped to
  // keep it from pushing the pipeline and action controls off the toolbar. aria-label keeps it all.
  const visibleCopy =
    appliedName === undefined
      ? triggerLabel
      : `${triggerLabel}: ${truncateFilterName(appliedName)}`;
  // The entry names what the dialog it opens will do, since the dialog seeds itself from the
  // selected filter: opening "Create new filter" onto an Edit form misreports the outcome.
  const selectedFilter = savedFilters.find((f) => f.id === selectedFilterId);
  const createEntryLabel = filterSaveCopy(filterSaveMode(selectedFilter)).title;
  const ordered = [...savedFilters].sort((a, b) => Number(b.favorite) - Number(a.favorite));

  function clearAll(): void {
    onSelectFilter?.(null);
    onClearConditions?.();
    onClearOwner?.();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={triggerCopy}
          data-filtered={filtered}
          className={cn(
            "bg-card font-normal",
            filtered && "border-ring bg-accent font-medium text-foreground",
          )}
        >
          <Filter aria-hidden="true" className="h-4 w-4" />
          {visibleCopy}
          {activeCount > 0 ? (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-primary-foreground text-xs">
              {activeCount}
            </span>
          ) : null}
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <div className="max-h-80 overflow-y-auto">
          <DropdownMenuItem
            aria-current={filtered ? undefined : "true"}
            onSelect={clearAll}
            className={cn(!filtered && "bg-accent font-medium")}
          >
            All open deals
          </DropdownMenuItem>
          {ordered.map((f) => (
            <SavedFilterItem
              key={f.id}
              filter={f}
              selected={selectedFilterId === f.id}
              onPick={() => onSelectFilter?.(f)}
              onToggleFavorite={onToggleFavorite}
              onRequestDelete={onDeleteFilter === undefined ? undefined : setPendingDelete}
            />
          ))}
        </div>
        {onCreateFilter !== undefined && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreateFilter} className="font-medium text-primary">
              <span aria-hidden="true">+</span> {createEntryLabel}
            </DropdownMenuItem>
          </>
        )}
        {filtered && <DropdownMenuItem onSelect={clearAll}>Clear filter</DropdownMenuItem>}
      </DropdownMenuContent>

      {/* Sibling of the menu content, so a menu that closes cannot take the dialog with it. */}
      <DeleteSavedFilterConfirm
        pending={pendingDelete}
        noun="filter"
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={(id) => onDeleteFilter?.(id)}
      />
    </DropdownMenu>
  );
}
