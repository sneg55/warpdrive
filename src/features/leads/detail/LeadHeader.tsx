"use client";
import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { addFormCustomFieldDefs } from "@/features/custom-fields/CustomFieldCreateFields";
import { EditableHeading } from "@/features/inline-edit/EditableHeading";
import type { InlineSaveResult } from "@/features/inline-edit/useInlineEditField";
import { useLabelChipResolver } from "@/features/labels/useLabelChipResolver";
import { useDetailDrawerClose } from "@/features/navigation/detailDrawerClose";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ConvertLeadDialog } from "../ConvertLeadDialog";
import { POP_ITEM, PopMenu } from "../inbox/PopMenu";
import type { LeadDetail } from "../leadRepo";
import {
  archiveLeadAction,
  bulkUpdateLeadsAction,
  convertLeadAction,
  updateLeadAction,
} from "../leadServerActions";

// Lead detail header: title, owner, labels, and the Convert / Archive / overflow actions. Mutations
// go through the lead server actions (CSRF + Result + CAS for convert) then navigate or refresh.
export function LeadHeader({ lead }: { lead: LeadDetail }): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [pending, setPending] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const dealFieldsQ = trpc.customFields.listDefs.useQuery({ target: "deal" });
  const dealFields = dealFieldsQ.data ?? [];
  const archived = lead.archivedAt !== null;
  const converted = lead.convertedDealId !== null;
  const closeDrawer = useDetailDrawerClose();
  const utils = trpc.useUtils();
  const resolveLabels = useLabelChipResolver("lead");
  const labels = resolveLabels(lead.labels);

  async function convert(customFields: Record<string, unknown> = {}): Promise<boolean> {
    setPending(true);
    const r = await convertLeadAction(
      { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), customFields },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      router.push(`/deals/${r.value.dealId}`);
      return true;
    }
    reportError(r.error.id);
    return false;
  }

  async function updateTitle(title: string): Promise<InlineSaveResult> {
    const r = await updateLeadAction(
      { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString(), title },
      readCsrfToken(),
    );
    if (r.ok) {
      router.refresh();
      return { ok: true, value: undefined };
    }
    reportError(r.error.id);
    return { ok: false, error: r.error.id };
  }

  async function toggleArchive(): Promise<void> {
    setPending(true);
    const r = await archiveLeadAction({ leadId: lead.id, archived: !archived }, readCsrfToken());
    setPending(false);
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  async function del(): Promise<void> {
    setPending(true);
    const r = await bulkUpdateLeadsAction(
      { ids: [lead.id], change: { deleted: true } },
      readCsrfToken(),
    );
    setPending(false);
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    // From the intercepted slide-over, router.push("/leads") is a soft navigation, and Next renders
    // a parallel slot's previously active state on a soft navigation. The drawer would stay open on
    // the lead we just deleted, so the delete reads as a no-op and a second Delete re-renders the
    // missing lead into LeadDetailView's notFound(). Dismiss the drawer instead; only the standalone
    // page (deep link / hard load), which has no drawer, navigates.
    if (closeDrawer !== null) closeDrawer();
    else router.push("/leads");
    // The Leads inbox list is a tRPC query, not part of the route payload, so neither the drawer
    // close nor the push refreshes it: without this the list comes back still showing the lead.
    await utils.lead.list.invalidate();
  }

  return (
    <header className="mb-4 border-b pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <EditableHeading title={lead.title} label="lead title" onCommit={updateTitle} />
          {/* Owner is not duplicated here: PD's lead drawer shows it only as a sidebar field
              (Summary > Owner), so the header carries just labels + archived state. */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground empty:hidden">
            {labels.map((label) => (
              <span
                key={label.name}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${label.classes}`}
              >
                {label.name}
              </span>
            ))}
            {archived && <span className="rounded bg-muted px-2 py-0.5 text-xs">Archived</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={pending || converted || dealFieldsQ.isLoading}
            onClick={() => {
              if (addFormCustomFieldDefs(dealFields).length > 0) setConvertDialogOpen(true);
              else void convert();
            }}
            className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-success-foreground transition-[opacity,scale] duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:opacity-50 motion-reduce:transition-opacity"
          >
            {converted ? "Converted" : "Convert to deal"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void toggleArchive()}
            className="rounded-md border px-3 py-1.5 text-sm transition-[background-color,opacity,scale] duration-150 ease-out hover:bg-accent active:scale-[0.96] disabled:opacity-50 motion-reduce:transition-[background-color,opacity]"
          >
            {archived ? "Restore" : "Archive"}
          </button>
          <PopMenu
            triggerLabel="More lead actions"
            triggerClassName="rounded-md border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            align="right"
            trigger={<EllipsisVertical aria-hidden="true" className="h-4 w-4" />}
          >
            {(close) => (
              <button
                type="button"
                role="menuitem"
                className={`${POP_ITEM} text-destructive`}
                onClick={() => {
                  close();
                  void del();
                }}
              >
                Delete lead
              </button>
            )}
          </PopMenu>
        </div>
      </div>
      {convertDialogOpen && (
        <ConvertLeadDialog
          defs={dealFields}
          onClose={() => setConvertDialogOpen(false)}
          onConvert={convert}
        />
      )}
    </header>
  );
}
