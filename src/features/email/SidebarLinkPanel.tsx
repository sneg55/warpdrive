"use client";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { STRINGS } from "@/constants/strings";
import { QuickAddContact } from "@/features/contacts/QuickAddContact";
import { AddDealModal } from "@/features/deals/AddDealModal";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { LinkExistingCombobox } from "./LinkExistingCombobox";
import { linkThread } from "./linkActions";

const S = STRINGS.inbox;

interface SidebarLinkPanelProps {
  threadId: string;
  personId: string | null;
  personName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  subject: string | null;
  primaryEmail: string | null;
  primaryName: string | null;
  canEdit: boolean;
  onLinked: () => void;
}

// Pipedrive-shaped link panel: search an existing person/deal to link, or create one prefilled from
// the thread and auto-link the new record. Owner-gated (canEdit === canCompose); the whole panel is
// hidden for viewers who cannot mutate the mailbox, so no control is offered that the backend rejects.
export function SidebarLinkPanel(props: SidebarLinkPanelProps): React.ReactNode {
  const { threadId, personId, personName, dealId, dealTitle, subject } = props;
  const { primaryEmail, primaryName, canEdit, onLinked } = props;
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const reportError = useActionError();

  const pipelinesQ = trpc.pipeline.list.useQuery(undefined, { enabled: canEdit });
  const pipelines = (pipelinesQ.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: p.stages.map((s) => ({ id: s.id, name: s.name })),
  }));
  const firstPipelineId = pipelines[0]?.id ?? null;

  if (!canEdit) return null;

  async function link(patch: { personId: string } | { dealId: string }): Promise<void> {
    const r = await linkThread(readCsrfToken(), { threadId, ...patch });
    // Surface a denied/expired link instead of a silent no-op, and never signal success on failure
    // (feedback-surface-mutation-failures).
    if (r.ok) onLinked();
    else reportError(r.error.id);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.sidebarContactHeading}
        </h3>
        {personId !== null ? (
          <>
            <LinkedRecordRow
              name={personName}
              href={`/contacts/people/${personId}`}
              view={S.viewContact}
            />
            <LinkExistingCombobox
              kind="person"
              triggerLabel={S.changeLink}
              onPick={(id) => void link({ personId: id })}
            />
          </>
        ) : (
          <>
            <LinkExistingCombobox
              kind="person"
              triggerLabel={S.linkExisting}
              onPick={(id) => void link({ personId: id })}
            />
            <QuickAddContact
              kind="person"
              triggerLabel={S.createContact}
              prefillName={primaryName ?? undefined}
              prefillEmail={primaryEmail ?? undefined}
              onCreated={(id) => void link({ personId: id })}
            />
          </>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.sidebarDealHeading}
        </h3>
        {dealId !== null ? (
          <>
            <LinkedRecordRow name={dealTitle} href={`/deals/${dealId}`} view={S.viewDeal} />
            <LinkExistingCombobox
              kind="deal"
              triggerLabel={S.changeLink}
              onPick={(id) => void link({ dealId: id })}
            />
          </>
        ) : (
          <>
            <LinkExistingCombobox
              kind="deal"
              triggerLabel={S.linkExisting}
              onPick={(id) => void link({ dealId: id })}
            />
            <button
              type="button"
              disabled={firstPipelineId === null}
              onClick={() => setDealModalOpen(true)}
              className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
            >
              {S.addNewDeal}
            </button>
          </>
        )}
      </section>

      {dealModalOpen && firstPipelineId !== null && (
        <AddDealModal
          pipelineId={firstPipelineId}
          pipelines={pipelines}
          prefillTitle={subject ?? undefined}
          onClose={() => setDealModalOpen(false)}
          onCreated={(id) => {
            setDealModalOpen(false);
            void link({ dealId: id });
          }}
        />
      )}
    </div>
  );
}

function LinkedRecordRow({
  name,
  href,
  view,
}: {
  name: string | null;
  href: string;
  view: string;
}): React.ReactNode {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
      <span className="min-w-0 truncate text-sm font-medium">{name ?? view}</span>
      <a href={href} className="shrink-0 text-xs text-primary hover:underline">
        {view}
      </a>
    </div>
  );
}
