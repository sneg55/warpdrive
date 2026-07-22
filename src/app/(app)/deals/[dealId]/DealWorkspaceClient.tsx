"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type DealSidebarSectionPreference,
  normalizeDealSidebarSections,
} from "@/constants/dealSidebarSections";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import { DealActionErrorProvider } from "@/features/deal-workspace/DealActionErrorProvider";
import { DealSidebar } from "@/features/deal-workspace/DealSidebar";
import { DealHeader } from "@/features/deal-workspace/header/DealHeader";
import { useBlockVisibility } from "@/features/deal-workspace/header/useBlockVisibility";
import type { DealWorkspace } from "@/features/deal-workspace/summaryRepo";
import { trpc } from "@/lib/trpc-client";
import { WorkspaceTabs } from "./tabs";

type Tab = "all" | "activities" | "notes" | "email" | "files" | "changelog";

interface DealWorkspaceClientProps {
  workspace: DealWorkspace;
  selfActorId: string;
  emailAccountId: string | null;
  // Sender mailbox address shown in the From row of the composer.
  emailAddress?: string;
  // Whether the actor may reassign the owner (deal.changeOwner), gated server-side too.
  canChangeOwner: boolean;
  // Whether the actor may delete this deal (deal.delete own/any), gated server-side too.
  canDelete: boolean;
  // Users offered in the owner-reassignment menu; empty until a non-privileged source exists.
  assignableUsers: { id: string; name: string }[];
  // Hidden deal-block ids seeded from the server pref (user_preferences.ui.dealHeaderBlocks).
  initialHiddenBlocks: string[];
  // Tenant base currency (settings.base_currency) so custom monetary fields render in it.
  baseCurrency: string;
  // Visible organizations offered by the sidebar Organization switch dialog.
  orgOptions?: Array<{ id: string; name: string }>;
  // Per-user sidebar section order and visibility.
  initialSidebarSections?: DealSidebarSectionPreference[];
  // Server pref (user_preferences.ui.scheduleFollowUpAfterWon), passed to the header's close
  // actions so marking the deal Won can prompt to schedule a follow-up activity.
  scheduleFollowUpAfterWon: boolean;
  // Built-in field keys hidden in Settings > Data fields, per entity, so the sidebar Organization
  // and Person sections drop the same rows the standalone detail pages do.
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
  // Block-visibility state is owned here so the hidden set can gate both the header controls and the
  // sibling sections (sidebar + body); the hook persists toggles to the server pref on change.
  const { isHidden, toggle } = useBlockVisibility(initialHiddenBlocks);

  const router = useRouter();
  const activities =
    trpc.activities.listForEntity.useQuery({ entityType: "deal", entityId: deal.id }).data ?? [];
  const utils = trpc.useUtils();
  // Participant emails feed the email composer's "prefill all participants" preference. Shares the
  // tRPC cache key the sidebar already populates, so this adds no extra round trip in practice.
  const participantEmails = (trpc.deal.participants.useQuery({ dealId: deal.id }).data ?? [])
    .map((p) => p.primaryEmail)
    .filter((e): e is string => e !== null && e !== "");

  // Completing/reopening an activity recomputes the deal's next_activity_at server-side, which
  // bumps deals.updatedAt (the optimistic-lock token the header sends with edits). Refresh the RSC
  // tree so DealHeader re-derives a fresh expectedUpdatedAt; otherwise the next stage change (or
  // title/owner edit) fails its CAS with "This deal changed elsewhere".
  const onActivityChanged = (): void => {
    void utils.activities.listForEntity.invalidate({ entityType: "deal", entityId: deal.id });
    router.refresh();
  };

  // Inline edit: clicking a Focus/History activity sets its id; the composer prefills from getForEdit
  // and opens in edit mode. Cleared on save (invalidate + refresh so the CAS token stays fresh) and
  // on cancel. The query is gated on a selected id, so it does not run until an activity is picked.
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const editForm = trpc.activities.getForEdit.useQuery(
    { id: editingActivityId ?? "" },
    { enabled: editingActivityId !== null },
  );
  const editingActivity = editingActivityId !== null ? (editForm.data ?? null) : null;

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
            sidebarSections={sidebarSections}
            onSidebarSectionsChange={setSidebarSections}
            hiddenOrgFields={hiddenOrgFields}
            hiddenPersonFields={hiddenPersonFields}
          />

          <div className="min-w-0">
            {/* Compose toolbar (Pipedrive): Activity/Notes/Email/Files. */}
            {!isHidden("email") && (
              <SharedComposeBar
                scope={{
                  entityType: "deal",
                  entityId: deal.id,
                  personId: person?.id,
                  orgId: org?.id,
                  personName: person?.name,
                  personEmail: person?.primaryEmail ?? undefined,
                  // Display values for the email composer's "Insert field" menu (EMAIL-21).
                  orgName: org?.name,
                  dealTitle: deal.title,
                  dealValue: deal.value ?? undefined,
                  participantEmails,
                }}
                emailAccountId={emailAccountId}
                emailAddress={emailAddress}
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
              />
            )}
          </div>
        </div>
      </div>
    </DealActionErrorProvider>
  );
}
