"use client";
import { ChevronDown } from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  DeleteSavedFilterConfirm,
  DeleteSavedFilterItem,
  type PendingFilterDelete,
} from "./SavedFilterDelete";
import type { SavedView } from "./savedView";

interface SavedViewMenuProps {
  views: SavedView[];
  selectedViewId: string | null;
  allRecordsActive: boolean;
  allLabel: string;
  canSave: boolean;
  onSelect: (view: SavedView | null) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveCurrent: () => void;
}

export function SavedViewMenu({
  views,
  selectedViewId,
  allRecordsActive,
  allLabel,
  canSave,
  onSelect,
  onToggleFavorite,
  onDelete,
  onSaveCurrent,
}: SavedViewMenuProps): React.ReactNode {
  const selected = views.find((v) => v.id === selectedViewId) ?? null;
  const ordered = [...views].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  const [pendingDelete, setPendingDelete] = useState<PendingFilterDelete | null>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Saved views"
        className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-sm text-foreground hover:bg-accent"
      >
        <span className="max-w-32 truncate">{selected?.name ?? "Saved views"}</span>
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="max-h-80 overflow-y-auto">
          <DropdownMenuItem
            aria-current={allRecordsActive ? "true" : undefined}
            onSelect={() => onSelect(null)}
            className={cn(allRecordsActive && "bg-accent font-medium")}
          >
            {allLabel}
          </DropdownMenuItem>
          {ordered.map((v) => (
            <div key={v.id} className="flex items-center">
              <DropdownMenuItem
                redactLabel
                aria-current={selectedViewId === v.id ? "true" : undefined}
                onSelect={() => onSelect(v)}
                className={cn("min-w-0 flex-1", selectedViewId === v.id && "bg-accent font-medium")}
              >
                <span className="truncate">{v.name}</span>
              </DropdownMenuItem>
              {v.isOwn && (
                <DropdownMenuItem
                  aria-label={v.favorite ? "Unfavorite view" : "Favorite view"}
                  onSelect={(e) => {
                    e.preventDefault();
                    onToggleFavorite(v.id);
                  }}
                  className="shrink-0 px-1.5 text-muted-foreground"
                >
                  <span aria-hidden="true">{v.favorite ? "★" : "☆"}</span>
                </DropdownMenuItem>
              )}
              {v.isOwn && (
                <DeleteSavedFilterItem
                  target={{ id: v.id, name: v.name, isShared: v.isShared }}
                  onRequest={setPendingDelete}
                />
              )}
            </div>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canSave}
          onSelect={onSaveCurrent}
          className="font-medium text-primary"
        >
          <span aria-hidden="true">+</span> Save current view
        </DropdownMenuItem>
      </DropdownMenuContent>

      <DeleteSavedFilterConfirm
        pending={pendingDelete}
        noun="view"
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={onDelete}
      />
    </DropdownMenu>
  );
}
