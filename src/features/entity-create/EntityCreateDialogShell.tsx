"use client";

import type React from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface EntityCreateDialogShellProps {
  title: string;
  children: React.ReactNode;
  bodyClassName?: string;
  error: string | null;
  pending: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

// The single create-dialog frame shared by deals, leads, people, and organizations. Entity
// variants own only their fields; sizing, scrolling, error treatment, actions, and dismissal
// behavior stay identical across every create surface.
export function EntityCreateDialogShell({
  title,
  children,
  bodyClassName,
  error,
  pending,
  submitDisabled = false,
  onSubmit,
  onClose,
}: EntityCreateDialogShellProps): React.ReactNode {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden bg-card p-0"
      >
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <div className={cn("flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>

        {error !== null && (
          <p
            role="alert"
            className="mx-5 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={pending || submitDisabled} onClick={onSubmit}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
