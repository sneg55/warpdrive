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
import { actionErrorContent } from "./actionError";

// Report a failed action so the shared app-wide modal can explain it. errorId is the AppError id
// from the action's Result (undefined for a rejected promise with no id). Any feature can call this
// in the `else` branch of a mutation instead of swallowing the failure. The deal workspace keeps its
// own richer reporter (useDealActionError); this is the default for everything else.
export type ReportActionError = (errorId?: string) => void;

// Default no-op: a component rendered outside the provider degrades to "no modal" rather than
// crashing, so call sites can always call useActionError() unconditionally. In-app the provider
// wraps the whole (app) shell, so the real reporter is always in scope.
const ActionErrorContext = createContext<ReportActionError>(() => {});

export function useActionError(): ReportActionError {
  return useContext(ActionErrorContext);
}

// Mounts once at the (app) shell root. Holds the id of the most recent failed action and renders a
// single shadcn Dialog explaining it. Closing clears the id.
export function ActionErrorProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  // null = nothing showing. A reported error stores its id (or "" when the action gave none).
  const [errorId, setErrorId] = useState<string | null>(null);
  const report: ReportActionError = withActionTelemetry((id) => setErrorId(id ?? ""), "app");
  const content = actionErrorContent(errorId ?? undefined);

  return (
    <ActionErrorContext.Provider value={report}>
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
    </ActionErrorContext.Provider>
  );
}
