"use client";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface LeadRowActionsProps {
  archived: boolean;
  converted: boolean;
  onOpen: () => void;
  onConvert: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  // Users offered in the "Change owner" submenu; empty hides the option (no reachable users list).
  assignableUsers: { id: string; name: string }[];
  onChangeOwner: (ownerId: string) => void;
}

// Trailing per-row ellipsis menu (Pipedrive parity). The trigger stops propagation so opening the
// menu never fires the row's open-detail navigation; menu items live in a portal, so their clicks
// never bubble to the row.
export function LeadRowActions({
  archived,
  converted,
  onOpen,
  onConvert,
  onArchiveToggle,
  onDelete,
  assignableUsers,
  onChangeOwner,
}: LeadRowActionsProps): React.ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Lead actions"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-44"
        // The row (LeadsTable <tr>) has its own onClick to open the lead. Radix portals the menu
        // but React events still bubble through the component tree, so without this a menu-item
        // click would also fire the row's open-detail navigation.
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
        <DropdownMenuItem onSelect={onConvert} disabled={converted}>
          {converted ? "Converted" : "Convert to deal"}
        </DropdownMenuItem>
        {assignableUsers.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Change owner</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-56 min-w-40 overflow-auto">
              {assignableUsers.map((u) => (
                <DropdownMenuItem key={u.id} onSelect={() => onChangeOwner(u.id)}>
                  {u.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onSelect={onArchiveToggle}>
          {archived ? "Restore" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete} className="text-destructive">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
