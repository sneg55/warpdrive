"use client";
import { EllipsisVertical } from "lucide-react";
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
  busy: boolean;
  onOpen: () => void;
  onConvert: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  assignableUsers: { id: string; name: string }[];
  onChangeOwner: (ownerId: string) => void;
}

export function LeadRowActions({
  archived,
  converted,
  busy,
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
        <EllipsisVertical aria-hidden="true" className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
        <DropdownMenuItem onSelect={onConvert} disabled={converted}>
          {converted ? "Converted" : "Convert to deal"}
        </DropdownMenuItem>
        {assignableUsers.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              disabled={busy}
              className="data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            >
              Change owner
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-56 min-w-40 overflow-auto">
              {assignableUsers.map((u) => (
                <DropdownMenuItem key={u.id} redactLabel onSelect={() => onChangeOwner(u.id)}>
                  {u.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onSelect={onArchiveToggle} disabled={busy}>
          {archived ? "Restore" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete} disabled={busy} className="text-destructive">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
