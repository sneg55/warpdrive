"use client";
import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ERROR_IDS } from "@/constants/errorIds";
import { ICON_BUTTON } from "@/constants/formStyles";
import { deleteDealAction } from "@/features/deal-workspace/actions";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { duplicateDealAction } from "@/features/deal-workspace/duplicateDealAction";
import { archiveDealAction } from "@/features/deals/archiveActions";
import { useDetailDrawerClose } from "@/features/navigation/detailDrawerClose";
import { copyWithToast } from "@/lib/clipboard/copyWithToast";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ConvertToLeadDialog } from "./ConvertToLeadDialog";
import { MergeDealDialog } from "./MergeDealDialog";

type Flow = "convert" | "merge" | "delete" | null;

interface DealActionsMenuProps {
  dealId: string;
  pipelineId: string;
  expectedUpdatedAt: string;
  canDelete: boolean;
  archived: boolean;
}

export function DealActionsMenu({
  dealId,
  pipelineId,
  expectedUpdatedAt,
  canDelete,
  archived,
}: DealActionsMenuProps): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();
  const closeDrawer = useDetailDrawerClose();
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [flow, setFlow] = useState<Flow>(null);

  async function duplicate(): Promise<void> {
    setPending(true);
    const r = await duplicateDealAction({ dealId }, readCsrfToken());
    setPending(false);
    if (r.ok) router.push(`/deals/${r.deal.id}`);
    else reportError(r.error.id);
  }

  async function toggleArchive(): Promise<void> {
    setPending(true);
    const r = await archiveDealAction({ dealId, archived: !archived }, readCsrfToken()).catch(
      () => ({ ok: false as const, error: { id: ERROR_IDS.UI_ACTION_UNCONFIRMED } }),
    );
    setPending(false);
    if (r.ok) startRefresh(() => router.refresh());
    else reportError(r.error.id);
  }

  async function remove(): Promise<void> {
    setPending(true);
    const r = await deleteDealAction({ dealId, expectedUpdatedAt }, readCsrfToken());
    setPending(false);
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    if (closeDrawer !== null) closeDrawer();
    else router.push("/pipeline");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Deal actions"
        disabled={pending || refreshing}
        className={ICON_BUTTON}
      >
        <EllipsisVertical aria-hidden="true" className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onSelect={() => void copyWithToast(`${location.origin}/deals/${dealId}`)}>
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void duplicate()}>Duplicate</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setFlow("convert")}>Convert to a lead</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setFlow("merge")}>Merge</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void toggleArchive()}>
          {archived ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        {canDelete && (
          <DropdownMenuItem onSelect={() => setFlow("delete")} className="text-destructive">
            Delete deal
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>

      {flow === "convert" && (
        <ConvertToLeadDialog
          dealId={dealId}
          expectedUpdatedAt={expectedUpdatedAt}
          open
          onOpenChange={(o) => {
            if (!o) setFlow(null);
          }}
        />
      )}
      {flow === "merge" && (
        <MergeDealDialog
          dealId={dealId}
          pipelineId={pipelineId}
          expectedUpdatedAt={expectedUpdatedAt}
          open
          onOpenChange={(o) => {
            if (!o) setFlow(null);
          }}
        />
      )}
      <ConfirmDialog
        open={flow === "delete"}
        onOpenChange={(o) => {
          if (!o) setFlow(null);
        }}
        title="Delete this deal?"
        description="This cannot be undone. The deal and its activity are removed for everyone."
        confirmLabel="Delete"
        destructive
        pending={pending}
        onConfirm={() => void remove()}
      />
    </DropdownMenu>
  );
}
