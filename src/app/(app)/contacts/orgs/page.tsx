import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeading } from "@/components/shell/PageHeading";
import { ListSectionSkeleton } from "@/components/shell/skeletons";
import { STRINGS } from "@/constants/strings";
import { OrgsList } from "@/features/contacts/OrgsList";
import { QuickAddContact } from "@/features/contacts/QuickAddContact";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export const metadata = { title: STRINGS.contacts.orgsHeading };

// Contacts: a paginated, visibility-filtered list of organizations. The heading renders
// immediately; the row data streams into the <Suspense> boundary so a navigation shows the real
// page chrome without waiting on the list query.
export default async function OrgsListPage(): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  return (
    <main aria-label={STRINGS.contacts.orgsHeading} className="flex flex-col gap-4">
      <PageHeading
        crumbs={[
          { label: STRINGS.nav.contacts, href: "/contacts/people" },
          { label: STRINGS.contacts.orgsHeading },
        ]}
        title={STRINGS.contacts.orgsHeading}
        actions={<QuickAddContact kind="org" />}
      />
      <Suspense fallback={<ListSectionSkeleton />}>
        <OrgsSection actorId={ctx.actor.id} />
      </Suspense>
    </main>
  );
}

// Data region: fetched inside the Suspense boundary so the heading above never waits on it.
// createContext is React.cache-wrapped, so re-resolving the actor here reuses the page's work.
async function OrgsSection({ actorId }: { actorId: string }): Promise<React.ReactNode> {
  const ctx = await createContext();
  const caller = createCaller(ctx);
  const [{ rows, total, refLabels }, prefs, customFieldDefs, baseCurrency] = await Promise.all([
    caller.contacts.listOrgs({ offset: 0, limit: 50 }),
    getPreferencesForActor(ctx.db, actorId),
    listDefs(ctx.db, "organization", {}, AbortSignal.timeout(8000)),
    readBaseCurrency(ctx.db, AbortSignal.timeout(8000)),
  ]);
  return (
    <OrgsList
      rows={rows.map((r) => ({
        id: r.id,
        name: r.name,
        address: r.address,
        customFields: r.customFields,
        peopleCount: r.peopleCount,
        closedDeals: r.closedDeals,
        openDeals: r.openDeals,
      }))}
      total={total}
      initialColumns={prefs.ui.orgsView}
      customFieldDefs={customFieldDefs}
      baseCurrency={baseCurrency}
      refLabels={refLabels}
    />
  );
}
