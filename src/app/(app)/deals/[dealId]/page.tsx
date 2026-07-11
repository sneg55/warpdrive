import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { listOrgOptions } from "@/features/contacts/orgOptionsRepo";
import { listHiddenBuiltins } from "@/features/custom-fields/hiddenBuiltinsRepo";
import { getWorkspace } from "@/features/deal-workspace/summaryRepo";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { getActorMailbox } from "@/features/email/mailboxOwnership";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { listAssignableUsers } from "@/features/identity/users.service";
import { cachedDetailLoad } from "@/features/navigation/cachedDetailLoad";
import { entityTitle } from "@/features/navigation/pageTitle";
import { can } from "@/features/permissions/can";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { DealWorkspaceClient } from "./DealWorkspaceClient";

const load = cachedDetailLoad((ctx, actor, dealId) =>
  getWorkspace(ctx.db, actor, dealId, AbortSignal.timeout(10_000)),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dealId: string }>;
}): Promise<Metadata> {
  const { dealId } = await params;
  const loaded = await load(dealId);
  const name = loaded.kind === "ok" ? loaded.value.deal.title : null;
  return { title: entityTitle(name, STRINGS.titles.dealFallback) };
}

export default async function DealPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}): Promise<React.ReactNode> {
  const { dealId } = await params;
  const loaded = await load(dealId);
  if (loaded.kind === "unauth") {
    redirect("/login");
  }
  if (loaded.kind === "notfound") {
    notFound();
  }
  // None of these reads depend on each other, only on the already-loaded deal and actor, so they
  // are issued together rather than one round trip at a time.
  const [mailbox, prefs, baseCurrency, assignableUsers, orgOptions, hiddenBuiltins] =
    await Promise.all([
      getActorMailbox(db, loaded.actor.id, AbortSignal.timeout(10_000)),

      // Hidden deal-block ids persist per user in user_preferences.ui.dealHeaderBlocks (spec 0).
      getPreferencesForActor(db, loaded.actor.id),

      readBaseCurrency(db, AbortSignal.timeout(8000)),

      // Owner-reassignment options come from Unit 0's non-privileged listAssignableUsers
      // (active users projected to { id, name }); unlike listUsers it is not MANAGE-gated, so any
      // actor holding deal.changeOwner can populate the picker. Called directly on the loaded db
      // to avoid rebuilding the request context (the tRPC caller would re-hydrate the session).
      listAssignableUsers(db, AbortSignal.timeout(5000)),

      listOrgOptions(
        db,
        { ...loaded.actor, primaryVisibilityGroupId: null },
        AbortSignal.timeout(5000),
      ),

      // Built-in fields hidden in Settings > Data fields, so the sidebar Organization/Person
      // sections drop the same rows the standalone detail pages do (bucketed per entity).
      listHiddenBuiltins(db, AbortSignal.timeout(10_000)),
    ]);

  // getWorkspace already read the pipeline row for its own visibility gate and hands back the
  // group, so the page builds the same VisibleDeal without a second query for that row.
  const visibleDeal = toVisibleDeal(loaded.value.deal, loaded.value.pipelineVisibilityGroupId);
  const canChangeOwner = can(loaded.actor, "deal.changeOwner", visibleDeal);
  // Delete is gated on deal.delete (own/any), independent of edit; hide the menu item when the
  // actor lacks it. deleteDeal re-checks server-side, so this is UX only, not the security boundary.
  const canDelete = can(loaded.actor, "deal.delete", visibleDeal);

  const initialHiddenBlocks = prefs.ui.dealHeaderBlocks ?? [];
  const initialSidebarSections = prefs.ui.dealSidebarSections;
  const scheduleFollowUpAfterWon = prefs.ui.scheduleFollowUpAfterWon ?? false;

  return (
    <DealWorkspaceClient
      workspace={loaded.value}
      selfActorId={loaded.actor.id}
      emailAccountId={mailbox?.id ?? null}
      emailAddress={mailbox?.emailAddress}
      canChangeOwner={canChangeOwner}
      canDelete={canDelete}
      assignableUsers={assignableUsers}
      initialHiddenBlocks={initialHiddenBlocks}
      initialSidebarSections={initialSidebarSections}
      baseCurrency={baseCurrency}
      orgOptions={orgOptions}
      scheduleFollowUpAfterWon={scheduleFollowUpAfterWon}
      hiddenOrgFields={hiddenBuiltins.organization}
      hiddenPersonFields={hiddenBuiltins.person}
    />
  );
}
