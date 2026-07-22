"use client";
import type React from "react";
import { AddDealPersonColumn, type ContactPoint } from "@/features/deals/AddDealPersonColumn";
import { EntityCreateDialogShell } from "@/features/entity-create/EntityCreateDialogShell";

export interface EntityCreateModalShellProps {
  title: string;
  // The entity-specific fields (deal has pipeline/stage; lead does not) render in the left column.
  leftColumn: React.ReactNode;
  personMode: "existing" | "new";
  phones: ContactPoint[];
  emails: ContactPoint[];
  onPhones: (phones: ContactPoint[]) => void;
  onEmails: (emails: ContactPoint[]) => void;
  personCustomFields?: React.ReactNode;
  error: string | null;
  pending: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

// Deal/lead specialization of the shared create-dialog frame. Their entity-specific fields stay
// on the left and the reusable inline-person fields stay on the right.
export function EntityCreateModalShell(props: EntityCreateModalShellProps): React.ReactNode {
  const {
    title,
    leftColumn,
    personMode,
    phones,
    emails,
    onPhones,
    onEmails,
    personCustomFields,
    error,
    pending,
    submitDisabled,
    onSubmit,
    onClose,
  } = props;

  return (
    <EntityCreateDialogShell
      title={title}
      bodyClassName="grid gap-6 md:grid-cols-[1.4fr_1fr]"
      error={error}
      pending={pending}
      submitDisabled={submitDisabled}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      {/* min-w-0 lets both fr tracks shrink to the dialog instead of overflowing it. */}
      <div className="min-w-0">{leftColumn}</div>
      <div className="min-w-0">
        <AddDealPersonColumn
          disabled={personMode !== "new"}
          phones={phones}
          emails={emails}
          onPhones={onPhones}
          onEmails={onEmails}
        />
        {personMode === "new" ? personCustomFields : null}
      </div>
    </EntityCreateDialogShell>
  );
}
