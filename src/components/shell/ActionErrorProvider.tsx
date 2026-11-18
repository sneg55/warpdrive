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

export type ReportActionError = (errorId?: string) => void;

const ActionErrorContext = createContext<ReportActionError>(() => {});

export function useActionError(): ReportActionError {
  return useContext(ActionErrorContext);
}

export function ActionErrorProvider({ children }: { children: React.ReactNode }): React.ReactNode {
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
