"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { createContext, useContext, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ERROR_IDS } from "@/constants/errorIds";
import { withActionTelemetry } from "@/features/observability/resultSeam";
import { dealActionErrorContent } from "./dealActionError";

export type ReportDealActionError = (errorId?: string) => void;

const DealActionErrorContext = createContext<ReportDealActionError>(() => {});

export function useDealActionError(): ReportDealActionError {
  return useContext(DealActionErrorContext);
}

export function DealActionErrorProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const router = useRouter();
  const [errorId, setErrorId] = useState<string | null>(null);
  const report: ReportDealActionError = withActionTelemetry((id) => {
    setErrorId(id ?? "");
    if (id === ERROR_IDS.DEAL_PRECONDITION) router.refresh();
  }, "deal");
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
