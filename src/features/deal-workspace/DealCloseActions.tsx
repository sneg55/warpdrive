"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Tip } from "@/components/ui/tooltip";
import type { DealStatus } from "@/constants/dealStatus";
import { AddActivityModal } from "@/features/activities/AddActivityModal";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { DealStatusBadge } from "@/features/deal-workspace/DealStatusBadge";
import { MarkLostDialog } from "@/features/deal-workspace/MarkLostDialog";
import { playWinChime } from "@/features/deals/winChime";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { readCsrfToken } from "@/utils/csrfCookie";
import { markWonAction, reopenDealAction } from "./actions";

export interface DealCloseActionsProps {
  dealId: string;
  status: DealStatus;
  lostReasonOptions: Array<{ id: string; name: string }>;
  lostReasonName?: string | null;
  lostReasonText?: string | null;
  scheduleFollowUpAfterWon: boolean;
}

export function DealCloseActions({
  dealId,
  status,
  lostReasonOptions,
  lostReasonName = null,
  lostReasonText = null,
  scheduleFollowUpAfterWon,
}: DealCloseActionsProps): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();
  const { winSound } = useInterfacePrefs();
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);

  async function reopen(): Promise<void> {
    setPending(true);
    const r = await reopenDealAction({ dealId }, readCsrfToken());
    setPending(false);
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  if (status !== "open") {
    const reasonLabel =
      status === "lost"
        ? [lostReasonName, lostReasonText]
            .filter((s): s is string => typeof s === "string" && s.trim() !== "")
            .join(" · ")
        : "";
    return (
      <div className="flex items-center gap-2">
        <DealStatusBadge status={status} />
        {reasonLabel !== "" && (
          <Tip label={reasonLabel}>
            <span className="max-w-48 truncate text-xs text-muted-foreground">{reasonLabel}</span>
          </Tip>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => void reopen()}
          className="rounded-md border px-2 py-1 text-xs font-medium transition-[background-color,scale] duration-150 ease-out hover:bg-accent active:not-disabled:scale-[0.96] disabled:opacity-50"
        >
          Reopen
        </button>
      </div>
    );
  }

  async function won(): Promise<void> {
    setPending(true);
    const r = await markWonAction({ dealId }, readCsrfToken());
    setPending(false);
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    if (winSound) playWinChime();
    if (scheduleFollowUpAfterWon) {
      setShowFollowUp(true);
    } else {
      router.refresh();
    }
  }

  function closeFollowUp(): void {
    setShowFollowUp(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <DealStatusBadge status="open" />
      <button
        type="button"
        disabled={pending}
        onClick={() => void won()}
        className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-success-foreground transition-[opacity,scale] duration-150 ease-out hover:opacity-90 active:not-disabled:scale-[0.96] disabled:opacity-50"
      >
        Won
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setPicking(true)}
        className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-[opacity,scale] duration-150 ease-out hover:opacity-90 active:not-disabled:scale-[0.96] disabled:opacity-50"
      >
        Lost
      </button>
      <MarkLostDialog
        dealId={dealId}
        open={picking}
        onOpenChange={setPicking}
        lostReasonOptions={lostReasonOptions}
        onSuccess={() => router.refresh()}
      />
      {showFollowUp && (
        <AddActivityModal dealId={dealId} onCreated={closeFollowUp} onClose={closeFollowUp} />
      )}
    </div>
  );
}
