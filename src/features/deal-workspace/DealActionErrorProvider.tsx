"use client";
import type React from "react";
import { createContext, useContext, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { withActionTelemetry } from "@/features/observability/resultSeam";
import { dealActionErrorContent } from "./dealActionError";

// Report a failed deal action so the shared modal can explain it. errorId is the AppError id from
// the action's Result (undefined for a rejected promise with no id). Both the header stage
// selector and the sidebar field/label editors call this instead of swallowing the failure.
export type ReportDealActionError = (errorId?: string) => void;

// Default no-op (matches sectionFilter's context pattern): a component rendered outside the
// provider degrades to "no modal" rather than crashing. In-app the provider always wraps the deal
// workspace, so the real reporter is always in scope.
const DealActionErrorContext = createContext<ReportDealActionError>(() => {});

export function useDealActionError(): ReportDealActionError {
  return useContext(DealActionErrorContext);
}

// Mounts once at the deal-workspace root. Holds the id of the most recent failed action and renders
// a single shadcn Dialog explaining it. Closing clears the id.
export function DealActionErrorProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  // null = no error showing. A reported error stores its id (or "" when the action gave none).
  const [errorId, setErrorId] = useState<string | null>(null);
  const report: ReportDealActionError = withActionTelemetry((id) => setErrorId(id ?? ""), "deal");
  const content = dealActionErrorContent(errorId ?? undefined);

  return (
    <DealActionErrorContext.Provider value={report}>
      {children}
      <Dialog
        open={errorId !== null}
        onOpenChange={(open) => {
          if (!open) setErrorId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{content.title}</DialogTitle>
            <DialogDescription>{content.body}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </DealActionErrorContext.Provider>
  );
}
