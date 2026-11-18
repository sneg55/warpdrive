"use client";
import { Trash2 } from "lucide-react";
import type React from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export interface PendingFilterDelete {
  id: string;
  name: string;
  isShared: boolean;
}

export function DeleteSavedFilterItem({
  target,
  onRequest,
}: {
  target: PendingFilterDelete;
  onRequest: (target: PendingFilterDelete) => void;
}): React.ReactNode {
  return (
    <DropdownMenuItem
      redactLabel
      aria-label={`Delete ${target.name}`}
      onSelect={(e) => {
        e.preventDefault();
        onRequest(target);
      }}
      className="shrink-0 px-1.5 text-muted-foreground focus:text-destructive"
    >
      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
    </DropdownMenuItem>
  );
}

export function DeleteSavedFilterConfirm({
  pending,
  noun,
  onOpenChange,
  onConfirm,
}: {
  pending: PendingFilterDelete | null;
  noun: "filter" | "view";
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: string) => void;
}): React.ReactNode {
  if (pending === null) return null;
  const scope = pending.isShared ? ", for everyone it is shared with" : "";
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Delete ${noun}?`}
      description={`"${pending.name}" will be deleted${scope}. This cannot be undone.`}
      confirmLabel="Delete"
      destructive
      onConfirm={() => onConfirm(pending.id)}
    />
  );
}
