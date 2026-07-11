"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { convertToLeadAction } from "@/features/deal-workspace/convertToLeadAction";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { readCsrfToken } from "@/utils/csrfCookie";

// Confirm dialog for "Convert to a lead". Conversion archives the deal and creates a Leads-Inbox
// lead, so it is confirmed (not one-click) via the shadcn Dialog primitive (never window.confirm).
export function ConvertToLeadDialog({
  dealId,
  expectedUpdatedAt,
  open,
  onOpenChange,
}: {
  dealId: string;
  expectedUpdatedAt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();
  const [pending, setPending] = useState(false);

  async function confirm(): Promise<void> {
    setPending(true);
    const r = await convertToLeadAction({ dealId, expectedUpdatedAt }, readCsrfToken());
    setPending(false);
    if (r.ok) {
      onOpenChange(false);
      router.push(`/leads/${r.lead.id}`);
    } else {
      reportError(r.error.id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to a lead</DialogTitle>
          <DialogDescription>
            This moves the deal to the Leads Inbox as a new lead and archives the deal. You can
            convert the lead back to a deal later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={pending}>
            Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
