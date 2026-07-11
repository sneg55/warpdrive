"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { OwnerBadge } from "@/features/identity/OwnerBadge";
import { useLabelChipResolver } from "@/features/labels/useLabelChipResolver";
import { readCsrfToken } from "@/utils/csrfCookie";
import { POP_ITEM, PopMenu } from "../inbox/PopMenu";
import type { LeadDetail } from "../leadRepo";
import { archiveLeadAction, bulkUpdateLeadsAction, convertLeadAction } from "../leadServerActions";

// Lead detail header: title, owner, labels, and the Convert / Archive / overflow actions. Mutations
// go through the lead server actions (CSRF + Result + CAS for convert) then navigate or refresh.
export function LeadHeader({ lead }: { lead: LeadDetail }): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [pending, setPending] = useState(false);
  const archived = lead.archivedAt !== null;
  const converted = lead.convertedDealId !== null;
  const resolveLabels = useLabelChipResolver("lead");
  const labels = resolveLabels(lead.labels);

  async function convert(): Promise<void> {
    setPending(true);
    const r = await convertLeadAction(
      { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) router.push(`/deals/${r.value.dealId}`);
    else reportError(r.error.id);
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
    if (r.ok) router.push("/leads");
    else reportError(r.error.id);
  }

  return (
    <header className="mb-4 flex flex-wrap items-start gap-3 border-b pb-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold text-foreground">{lead.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <OwnerBadge name={lead.ownerName} />
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || converted}
          onClick={() => void convert()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.96] disabled:opacity-50"
        >
          {converted ? "Converted" : "Convert to deal"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void toggleArchive()}
          className="rounded-md border px-3 py-1.5 text-sm transition hover:bg-accent active:scale-[0.96] disabled:opacity-50"
        >
          {archived ? "Restore" : "Archive"}
        </button>
        <PopMenu
          triggerLabel="More lead actions"
          triggerClassName="rounded-md border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          align="right"
          trigger={
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            </svg>
          }
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
    </header>
  );
}
