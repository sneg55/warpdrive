"use client";
import type React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddDealPersonColumn, type ContactPoint } from "@/features/deals/AddDealPersonColumn";

export interface EntityCreateModalShellProps {
  title: string;
  // The entity-specific fields (deal has pipeline/stage; lead does not) render in the left column.
  leftColumn: React.ReactNode;
  personMode: "existing" | "new";
  phones: ContactPoint[];
  emails: ContactPoint[];
  onPhones: (phones: ContactPoint[]) => void;
  onEmails: (emails: ContactPoint[]) => void;
  error: string | null;
  pending: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

// The shared Pipedrive-style create dialog chrome (overlay, two-column body, error banner, footer)
// plus the inline person column. Add deal and Add lead differ only by title, left column, and what
// their submit does, so those are props; everything else lives here once.
export function EntityCreateModalShell(props: EntityCreateModalShellProps): React.ReactNode {
  const {
    title,
    leftColumn,
    personMode,
    phones,
    emails,
    onPhones,
    onEmails,
    error,
    pending,
    onSubmit,
    onClose,
  } = props;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden bg-card p-0"
      >
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>

        {/* min-w-0 on each grid child: fr tracks default to minmax(auto, fr) and would refuse to
            shrink below their content, overflowing the dialog horizontally (the PERSON column
            clipped past the right edge). min-w-0 lets the tracks resolve to the container width. */}
        <div className="grid flex-1 gap-6 overflow-y-auto px-5 py-4 md:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0">{leftColumn}</div>
          <div className="min-w-0">
            <AddDealPersonColumn
              disabled={personMode !== "new"}
              phones={phones}
              emails={emails}
              onPhones={onPhones}
              onEmails={onEmails}
            />
          </div>
        </div>

        {error !== null && (
          <p
            role="alert"
            className="mx-5 mb-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm transition hover:bg-accent active:scale-[0.96]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.96] disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
