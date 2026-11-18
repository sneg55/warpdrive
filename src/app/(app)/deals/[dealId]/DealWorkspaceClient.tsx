"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type DealSidebarSectionPreference,
  normalizeDealSidebarSections,
} from "@/constants/dealSidebarSections";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import type { PersonMatchCandidate } from "@/features/contacts/personOptionsRepo";
import { DealActionErrorProvider } from "@/features/deal-workspace/DealActionErrorProvider";
import { DealSidebar } from "@/features/deal-workspace/DealSidebar";
import { DealHeader } from "@/features/deal-workspace/header/DealHeader";
import { useBlockVisibility } from "@/features/deal-workspace/header/useBlockVisibility";
import type { DealWorkspace } from "@/features/deal-workspace/summaryRepo";
import type { DraftSummary } from "@/features/email/draftRepo";
import { trpc } from "@/lib/trpc-client";
import { WorkspaceTabs } from "./tabs";

type Tab = "all" | "activities" | "notes" | "email" | "files" | "changelog";

interface DealWorkspaceClientProps {
  workspace: DealWorkspace;
  selfActorId: string;
  emailAccountId: string | null;
  emailAddress?: string;
  canChangeOwner: boolean;
  canDelete: boolean;
  assignableUsers: { id: string; name: string }[];
  initialHiddenBlocks: string[];
  baseCurrency: string;
  orgOptions?: Array<{ id: string; name: string }>;
  personOptions?: PersonMatchCandidate[];
  initialSidebarSections?: DealSidebarSectionPreference[];
  scheduleFollowUpAfterWon: boolean;
  hiddenOrgFields: ReadonlySet<string>;
  hiddenPersonFields: ReadonlySet<string>;
}

export function DealWorkspaceClient({
  workspace,
  selfActorId,
  emailAccountId,
  emailAddress,
  canChangeOwner,
  canDelete,
  assignableUsers,
  initialHiddenBlocks,
  baseCurrency,
  orgOptions = [],
  personOptions = [],
  initialSidebarSections,
  scheduleFollowUpAfterWon,
  hiddenOrgFields,
  hiddenPersonFields,
}: DealWorkspaceClientProps) {
  const { deal, person, org } = workspace;
  const [tab, setTab] = useState<Tab>("all");
  const [now] = useState(() => new Date());
  const [sidebarSections, setSidebarSections] = useState(() =>
    normalizeDealSidebarSections(initialSidebarSections),
  );
  const { isHidden, toggle } = useBlockVisibility(initialHiddenBlocks);

  const router = useRouter();
  const activities =
    trpc.activities.listForEntity.useQuery({ entityType: "deal", entityId: deal.id }).data ?? [];
  const utils = trpc.useUtils();
  const participantEmails = (trpc.deal.participants.useQuery({ dealId: deal.id }).data ?? [])
    .map((p) => p.primaryEmail)
    .filter((e): e is string => e !== null && e !== "");

  const onActivityChanged = (): void => {
    void utils.activities.listForEntity.invalidate({ entityType: "deal", entityId: deal.id });
    router.refresh();
  };

  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const editForm = trpc.activities.getForEdit.useQuery(
    { id: editingActivityId ?? "" },
    { enabled: editingActivityId !== null },
  );
  const editingActivity = editingActivityId !== null ? (editForm.data ?? null) : null;

  const [resumeDraft, setResumeDraft] = useState<DraftSummary | null>(null);

  return (
    <DealActionErrorProvider>
      <div className="flex h-full flex-col p-4">
        <DealHeader
          workspace={workspace}
          selfActorId={selfActorId}
          canChangeOwner={canChangeOwner}
          canDelete={canDelete}
          assignableUsers={assignableUsers}
          isHidden={isHidden}
          toggle={toggle}
          scheduleFollowUpAfterWon={scheduleFollowUpAfterWon}
        />

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[34fr_66fr]">
          <DealSidebar
            workspace={workspace}
            now={now}
            isHidden={isHidden}
            baseCurrency={baseCurrency}
            orgOptions={orgOptions}
            personOptions={personOptions}
            sidebarSections={sidebarSections}
            onSidebarSectionsChange={setSidebarSections}
            hiddenOrgFields={hiddenOrgFields}
            hiddenPersonFields={hiddenPersonFields}
          />

          <div className="min-w-0">
            {!isHidden("email") && (
              <SharedComposeBar
                scope={{
                  entityType: "deal",
                  entityId: deal.id,
                  personId: person?.id,
                  orgId: org?.id,
                  personName: person?.name,
                  personEmail: person?.primaryEmail ?? undefined,
                  orgName: org?.name,
                  dealTitle: deal.title,
                  dealValue: deal.value ?? undefined,
                  participantEmails,
                }}
                emailAccountId={emailAccountId}
                emailAddress={emailAddress}
                resumeDraft={resumeDraft}
                onResumeDraftDone={() => setResumeDraft(null)}
                onActivityCreated={() =>
                  void utils.activities.listForEntity.invalidate({
                    entityType: "deal",
                    entityId: deal.id,
                  })
                }
                onNoteCreated={() =>
                  void utils.collaboration.listNotes.invalidate({
                    entityType: "deal",
                    entityId: deal.id,
                  })
                }
                editing={editingActivity}
                onEditSaved={() => {
                  onActivityChanged();
                  setEditingActivityId(null);
                }}
                onEditCancel={() => setEditingActivityId(null)}
              />
            )}

            {!isHidden("timeline") && (
              <WorkspaceTabs
                deal={deal}
                tab={tab}
                onTab={setTab}
                activities={activities}
                stages={workspace.stageProgress.chips}
                createdActorName={workspace.owner?.name ?? null}
                onActivityChanged={onActivityChanged}
                onNoteChanged={() =>
                  void utils.collaboration.listNotes.invalidate({
                    entityType: "deal",
                    entityId: deal.id,
                  })
                }
                onEditActivity={setEditingActivityId}
                onResumeDraft={setResumeDraft}
              />
            )}
          </div>
        </div>
      </div>
    </DealActionErrorProvider>
  );
}
