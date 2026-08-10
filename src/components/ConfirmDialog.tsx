"use client";
import type React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  // Copy for the affirmative action, e.g. "Delete". Kept short: the title carries the question.
  confirmLabel: string;
  cancelLabel?: string;
  // Styles the affirmative action as destructive (red). Irreversible actions set this.
  destructive?: boolean;
  // Fired when the user affirms. The dialog closes itself first, so the caller only runs the work.
  onConfirm: () => void;
  pending?: boolean;
}

// The single confirmation surface for irreversible actions (CLAUDE.md "Use the design system,
// never reinvent"): a shadcn AlertDialog, never window.confirm. Unlike the browser's native
// chrome it is themed, focuses Cancel, is keyboard/screen-reader correct via role="alertdialog",
// and cannot be suppressed by the "prevent this page from creating additional dialogs" checkbox.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  pending = false,
}: ConfirmDialogProps): React.ReactNode {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={pending}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={onConfirm}
            className={cn(
              buttonVariants({ variant: destructive ? "destructive" : "default", size: "sm" }),
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
