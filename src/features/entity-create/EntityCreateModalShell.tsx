"use client";
import type React from "react";
import { AddDealPersonColumn, type ContactPoint } from "@/features/deals/AddDealPersonColumn";
import { EntityCreateDialogShell } from "@/features/entity-create/EntityCreateDialogShell";

export interface EntityCreateModalShellProps {
  title: string;
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
