import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeading } from "@/components/shell/PageHeading";
import { ListSectionSkeleton } from "@/components/shell/skeletons";
import { STRINGS } from "@/constants/strings";
import { PeopleList } from "@/features/contacts/PeopleList";
import { QuickAddContact } from "@/features/contacts/QuickAddContact";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export const metadata = { title: STRINGS.contacts.peopleHeading };

// Contacts nav landing: a paginated, visibility-filtered list of people. The heading renders
// immediately; the row data streams into the <Suspense> boundary so a navigation shows the real
// page chrome without waiting on the list query.
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

// Data region: fetched inside the Suspense boundary so the heading above never waits on it.
// createContext is React.cache-wrapped, so re-resolving the actor here reuses the page's work.
async function PeopleSection({ actorId }: { actorId: string }): Promise<React.ReactNode> {
  const ctx = await createContext();
  const caller = createCaller(ctx);
  const [{ rows, total }, orgOptions, prefs] = await Promise.all([
    caller.contacts.listPeople({ offset: 0, limit: 50 }),
    caller.contacts.orgOptions(),
    getPreferencesForActor(ctx.db, actorId),
  ]);
  // Resolve each person's org name from the visible org set (hidden orgs stay unnamed).
  // orgOptions is the plain {id,name} lookup (no count computation, no pagination cap),
  // which is all this page needs; listOrgs would compute people/deal counts for nothing.
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
      }))}
      total={total}
      orgNames={Object.fromEntries(orgNameById)}
      initialColumns={prefs.ui.peopleView}
    />
  );
}
