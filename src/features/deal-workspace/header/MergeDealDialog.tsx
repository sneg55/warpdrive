"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { mergeDealsAction } from "@/features/deal-workspace/mergeDealsAction";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";

// Merge picker (Pipedrive parity). The current deal is the SURVIVOR (target); the user picks
// another deal in the same pipeline to merge INTO it. The source deal's activities/notes/emails/
// participants/followers move onto this deal and the source is soft-deleted. Confirmed via the
// shadcn Dialog primitive (never window.confirm).
export function MergeDealDialog({
  dealId,
  pipelineId,
  expectedUpdatedAt,
  open,
  onOpenChange,
}: {
  dealId: string;
  pipelineId: string;
  expectedUpdatedAt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();
  const [sourceId, setSourceId] = useState("");
  const [pending, setPending] = useState(false);

  const listQ = trpc.deal.list.useQuery({ pipelineId }, { enabled: open, retry: false });
  const candidates = useMemo(
    () => (listQ.data?.rows ?? []).filter((d) => d.id !== dealId),
    [listQ.data, dealId],
  );
  const options = useMemo<ComboboxOption[]>(
    () => candidates.map((d) => ({ value: d.id, label: d.title })),
    [candidates],
  );

  async function confirm(): Promise<void> {
    const source = candidates.find((d) => d.id === sourceId);
    if (source === undefined) return;
    setPending(true);
    const r = await mergeDealsAction(
      {
        targetDealId: dealId,
        sourceDealId: source.id,
        expectedTargetUpdatedAt: expectedUpdatedAt,
        expectedSourceUpdatedAt: new Date(source.updatedAt).toISOString(),
      },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      onOpenChange(false);
      router.refresh();
    } else {
      reportError(r.error.id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Merge deals</DialogTitle>
          <DialogDescription>
            Pick a deal to merge into this one. Its activities, notes, emails, participants, and
            followers move here, and the other deal is deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Combobox
          value={sourceId}
          onChange={setSourceId}
          options={options}
          ariaLabel="Deal to merge in"
          placeholder="Select a deal"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={pending || sourceId === ""}>
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
