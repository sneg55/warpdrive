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
