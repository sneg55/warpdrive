import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeading } from "@/components/shell/PageHeading";
import { ListSectionSkeleton } from "@/components/shell/skeletons";
import { STRINGS } from "@/constants/strings";
import { PeopleList } from "@/features/contacts/PeopleList";
import { QuickAddContact } from "@/features/contacts/QuickAddContact";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export const metadata = { title: STRINGS.contacts.peopleHeading };

export default async function PeopleListPage(): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  return (
    <main aria-label={STRINGS.contacts.peopleHeading} className="flex flex-col gap-4">
      <PageHeading
        crumbs={[
          { label: STRINGS.nav.contacts, href: "/contacts/people" },
          { label: STRINGS.contacts.peopleHeading },
        ]}
        title={STRINGS.contacts.peopleHeading}
        actions={<QuickAddContact kind="person" />}
      />
      <Suspense fallback={<ListSectionSkeleton />}>
        <PeopleSection actorId={ctx.actor.id} />
      </Suspense>
    </main>
  );
}

async function PeopleSection({ actorId }: { actorId: string }): Promise<React.ReactNode> {
  const ctx = await createContext();
  const caller = createCaller(ctx);
  const [{ rows, total, refLabels }, orgOptions, prefs, customFieldDefs, baseCurrency] =
    await Promise.all([
      caller.contacts.listPeople({ offset: 0, limit: 50 }),
      caller.contacts.orgOptions(),
      getPreferencesForActor(ctx.db, actorId),
      listDefs(ctx.db, "person", {}, AbortSignal.timeout(8000)),
      readBaseCurrency(ctx.db, AbortSignal.timeout(8000)),
    ]);
  const orgNameById = new Map(orgOptions.map((o) => [o.id, o.name]));
  return (
    <PeopleList
      rows={rows.map((r) => ({
        id: r.id,
        name: r.name,
        primaryEmail: r.primaryEmail,
        phone: r.phones.find((p) => p.primary === true)?.value ?? r.phones[0]?.value ?? null,
        orgId: r.orgId,
        orgName: r.orgId !== null ? (orgNameById.get(r.orgId) ?? null) : null,
        closedDeals: r.closedDeals,
        customFields: r.customFields,
      }))}
      total={total}
      orgNames={Object.fromEntries(orgNameById)}
      initialColumns={prefs.ui.peopleView}
      customFieldDefs={customFieldDefs}
      baseCurrency={baseCurrency}
      refLabels={refLabels}
    />
  );
}
