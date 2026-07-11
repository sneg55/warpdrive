"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import { ContactFollowersButton } from "@/features/contacts/ContactFollowersButton";
import { EditContactModal } from "@/features/contacts/EditContactModal";
import { MergeDialog } from "@/features/contacts/MergeDialog";
import type { PersonDetail } from "@/features/contacts/personsRepo";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { ContactActionsMenu } from "../../ContactActionsMenu";
import { ContactLabelsControl } from "../../ContactLabelsControl";
import { ContactTimelinePanel, FilesPanel, ListPanel, TabStrip } from "../../contactDetail.shared";
import { PersonEmailTab } from "../../PersonEmailTab";
import { PersonSidebar } from "./PersonSidebar";

type Tab = "deals" | "activity" | "email" | "files";

const TAB_LABELS: Record<Tab, string> = {
  deals: "Deals",
  activity: "Activity",
  email: "Email",
  files: "Files",
};

const TABS: readonly Tab[] = ["deals", "activity", "email", "files"];

type FollowerRef = { id: string; name: string; avatarUrl: string | null };

interface PersonDetailClientProps {
  person: PersonDetail;
  orgName: string | null;
  defs: CustomFieldDef[];
  hiddenBuiltins?: ReadonlySet<string>;
  canMerge: boolean;
  canDelete?: boolean;
  baseCurrency: string;
  followers?: FollowerRef[];
  isFollowedBySelf?: boolean;
}

export function PersonDetailClient({
  person,
  orgName,
  defs,
  hiddenBuiltins,
  canMerge,
  canDelete = false,
  baseCurrency,
  followers = [],
  isFollowedBySelf = false,
}: PersonDetailClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("deals");
  const [merging, setMerging] = useState(false);
  const [editing, setEditing] = useState(false);

  const deals = trpc.contacts.dealsForPerson.useQuery({ personId: person.id }).data ?? [];
  const orgOptions = trpc.contacts.orgOptions.useQuery().data ?? [];
  const utils = trpc.useUtils();

  function onMerged(survivorId: string): void {
    setMerging(false);
    // If this record was merged away, its own URL now 404s (loader filters deletedAt),
    // so navigate to the survivor. If it survived, a refresh picks up the merged data.
    if (survivorId === person.id) router.refresh();
    else router.push(`/contacts/people/${survivorId}`);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[35fr_65fr] gap-6 p-4">
      <div className="min-w-0 lg:order-last">
        <header className="flex items-center justify-between gap-4 mb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={person.name} className="h-9 w-9 text-sm" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-gray-900">{person.name}</h1>
              <ContactLabelsControl
                entityType="person"
                entityId={person.id}
                labels={person.labels}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ContactFollowersButton
              entityType="person"
              entityId={person.id}
              followers={followers}
              isFollowedBySelf={isFollowedBySelf}
            />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 active:scale-[0.96] transition-transform"
            >
              Edit
            </button>
            <ContactActionsMenu
              entityType="person"
              entityId={person.id}
              canMerge={canMerge}
              canDelete={canDelete}
              onMerge={() => setMerging(true)}
            />
          </div>
        </header>

        {editing === true && (
          <div className="mb-4">
            <EditContactModal
              kind="person"
              person={person}
              defs={defs}
              onSaved={() => {
                setEditing(false);
                router.refresh();
              }}
              onClose={() => setEditing(false)}
            />
          </div>
        )}

        {merging === true && (
          <div className="mb-4">
            <MergeDialog
              kind="person"
              current={{ id: person.id, name: person.name }}
              onMerged={onMerged}
              onClose={() => setMerging(false)}
            />
          </div>
        )}

        <SharedComposeBar
          scope={{
            entityType: "person",
            entityId: person.id,
            orgId: person.orgId ?? undefined,
            personName: person.name,
          }}
          emailAccountId={null}
          onActivityCreated={() => {
            void utils.contacts.contactTimeline.invalidate({
              entityType: "person",
              entityId: person.id,
            });
            void utils.contacts.activityStats.invalidate({
              entityType: "person",
              entityId: person.id,
            });
          }}
          onNoteCreated={() => {
            void utils.collaboration.listNotes.invalidate({
              entityType: "person",
              entityId: person.id,
            });
            void utils.contacts.contactTimeline.invalidate({
              entityType: "person",
              entityId: person.id,
            });
          }}
        />

        <TabStrip tabs={TABS} labels={TAB_LABELS} active={tab} onSelect={setTab} />

        <div role="tabpanel" className="pt-1">
          {tab === "deals" && (
            <ListPanel
              items={deals}
              empty="No deals yet."
              render={(d) => (
                <li key={d.id} className="text-sm">
                  <a href={`/deals/${d.id}`} className="text-blue-700 hover:underline">
                    {d.title}
                  </a>
                </li>
              )}
            />
          )}
          {tab === "activity" && <ContactTimelinePanel entityType="person" entityId={person.id} />}
          {tab === "email" && <PersonEmailTab personId={person.id} />}
          {tab === "files" && <FilesPanel entityType="person" entityId={person.id} />}
        </div>
      </div>

      <PersonSidebar
        person={person}
        orgName={orgName}
        defs={defs}
        hiddenBuiltins={hiddenBuiltins}
        baseCurrency={baseCurrency}
        orgOptions={orgOptions}
      />
    </div>
  );
}
