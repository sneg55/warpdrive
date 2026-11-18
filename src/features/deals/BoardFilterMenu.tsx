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
  appliedFilterName?: string;
  appliedDefinition?: FilterDefinition | null;
  activeCount?: number;
  triggerLabel?: string;
  ownerFiltered?: boolean;
  onSelectFilter?: (filter: SavedFilter | null) => void;
  onClearConditions?: () => void;
  onClearOwner?: () => void;
  onToggleFavorite?: (id: string) => void;
  onDeleteFilter?: (id: string) => void;
  onCreateFilter?: () => void;
}

export function BoardFilterMenu(props: BoardFilterMenuProps): React.ReactNode {
  const { savedFilters = [], selectedFilterId = null, appliedDefinition = null } = props;
  const { appliedFilterName } = props;
  const { activeCount = 0, triggerLabel = "Filter", onSelectFilter, onClearConditions } = props;
  const { onToggleFavorite, onDeleteFilter, onCreateFilter } = props;
  const { ownerFiltered = false, onClearOwner } = props;
  const [pendingDelete, setPendingDelete] = useState<PendingFilterDelete | null>(null);

  const filtered = selectedFilterId !== null || appliedDefinition !== null || ownerFiltered;
  const appliedName =
    appliedDefinition === null
      ? (savedFilters.find((f) => f.id === selectedFilterId)?.name ?? appliedFilterName)
      : undefined;
  const triggerCopy = appliedName === undefined ? triggerLabel : `${triggerLabel}: ${appliedName}`;
  const visibleCopy =
    appliedName === undefined
      ? triggerLabel
      : `${triggerLabel}: ${truncateFilterName(appliedName)}`;
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
          data-telemetry-redact="true"
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
