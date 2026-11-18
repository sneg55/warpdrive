import { notFound, redirect } from "next/navigation";
import type React from "react";
import { db } from "@/db/client";
import { listOrgOptions } from "@/features/contacts/orgOptionsRepo";
import { listPersonMatchCandidates } from "@/features/contacts/personOptionsRepo";
import { listHiddenBuiltins } from "@/features/custom-fields/hiddenBuiltinsRepo";
import { resolveCustomFieldRefLabelsFor } from "@/features/custom-fields/refLabels";
import { CustomFieldRefLabelsProvider } from "@/features/custom-fields/refLabelsContext";
import { getWorkspace } from "@/features/deal-workspace/summaryRepo";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { getActorMailbox } from "@/features/email/mailboxOwnership";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { listAssignableUsers } from "@/features/identity/users.service";
import { cachedDetailLoad } from "@/features/navigation/cachedDetailLoad";
import { can } from "@/features/permissions/can";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { DealWorkspaceClient } from "./DealWorkspaceClient";

export const loadDeal = cachedDetailLoad((ctx, actor, dealId) =>
  getWorkspace(ctx.db, actor, dealId, AbortSignal.timeout(10_000)),
);

export async function DealDetailView({ dealId }: { dealId: string }): Promise<React.ReactNode> {
  const loaded = await loadDeal(dealId);
  if (loaded.kind === "unauth") {
    redirect("/login");
  }
  if (loaded.kind === "notfound") {
    notFound();
  }

  const [
    mailbox,
    prefs,
    baseCurrency,
    assignableUsers,
    orgOptions,
    personOptions,
    hiddenBuiltins,
    refLabels,
  ] = await Promise.all([
    getActorMailbox(db, loaded.actor.id, AbortSignal.timeout(10_000)),

    getPreferencesForActor(db, loaded.actor.id),

    readBaseCurrency(db, AbortSignal.timeout(8000)),

    listAssignableUsers(db, AbortSignal.timeout(5000)),

    listOrgOptions(
      db,
      { ...loaded.actor, primaryVisibilityGroupId: null },
      AbortSignal.timeout(5000),
    ),

    loaded.value.person === null
      ? listPersonMatchCandidates(
          db,
          { ...loaded.actor, primaryVisibilityGroupId: null },
          AbortSignal.timeout(5000),
        )
      : Promise.resolve([]),

    listHiddenBuiltins(db, AbortSignal.timeout(10_000)),

    resolveCustomFieldRefLabelsFor(
      db,
      loaded.actor,
      [
        {
          defs: loaded.value.customFieldDefs,
          rows: [{ customFields: loaded.value.deal.customFields as Record<string, unknown> }],
        },
        {
          defs: loaded.value.personCustomFieldDefs,
          rows: [
            { customFields: (loaded.value.person?.customFields ?? {}) as Record<string, unknown> },
          ],
        },
        {
          defs: loaded.value.organizationCustomFieldDefs,
          rows: [
            { customFields: (loaded.value.org?.customFields ?? {}) as Record<string, unknown> },
          ],
        },
      ],
      AbortSignal.timeout(8000),
    ),
  ]);

  const visibleDeal = toVisibleDeal(loaded.value.deal, loaded.value.pipelineVisibilityGroupId);
  const canChangeOwner = can(loaded.actor, "deal.changeOwner", visibleDeal);
  const canDelete = can(loaded.actor, "deal.delete", visibleDeal);

  return (
    <CustomFieldRefLabelsProvider value={refLabels}>
      <DealWorkspaceClient
        workspace={loaded.value}
        selfActorId={loaded.actor.id}
        emailAccountId={mailbox?.id ?? null}
        emailAddress={mailbox?.emailAddress}
        canChangeOwner={canChangeOwner}
        canDelete={canDelete}
        assignableUsers={assignableUsers}
        initialHiddenBlocks={prefs.ui.dealHeaderBlocks ?? []}
        initialSidebarSections={prefs.ui.dealSidebarSections}
        baseCurrency={baseCurrency}
        orgOptions={orgOptions}
        personOptions={personOptions}
        scheduleFollowUpAfterWon={prefs.ui.scheduleFollowUpAfterWon ?? false}
        hiddenOrgFields={hiddenBuiltins.organization}
        hiddenPersonFields={hiddenBuiltins.person}
      />
    </CustomFieldRefLabelsProvider>
  );
}
