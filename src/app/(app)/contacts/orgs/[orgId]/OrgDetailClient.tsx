"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import { ContactFollowersButton } from "@/features/contacts/ContactFollowersButton";
import { EditContactModal } from "@/features/contacts/EditContactModal";
import { MergeDialog } from "@/features/contacts/MergeDialog";
import type { OrgDetail } from "@/features/contacts/orgsRepo";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { ContactActionsMenu } from "../../ContactActionsMenu";
import { ContactLabelsControl } from "../../ContactLabelsControl";
import { ContactTimelinePanel, FilesPanel, ListPanel, TabStrip } from "../../contactDetail.shared";
import { OrgEmailPanel } from "../../PersonEmailTab";
import { OrgSidebar } from "./OrgSidebar";

type Tab = "people" | "deals" | "activity" | "email" | "files";

const TAB_LABELS: Record<Tab, string> = {
  people: "People",
  deals: "Deals",
  activity: "Activity",
  email: "Email",
  files: "Files",
};

const TABS: readonly Tab[] = ["people", "deals", "activity", "email", "files"];

type FollowerRef = { id: string; name: string; avatarUrl: string | null };

interface OrgDetailClientProps {
  org: OrgDetail;
  defs: CustomFieldDef[];
  hiddenBuiltins?: ReadonlySet<string>;
  canMerge: boolean;
  canDelete?: boolean;
  baseCurrency: string;
  followers?: FollowerRef[];
  isFollowedBySelf?: boolean;
}

export function OrgDetailClient({
  org,
  defs,
  hiddenBuiltins,
  canMerge,
  canDelete = false,
  baseCurrency,
  followers = [],
  isFollowedBySelf = false,
}: OrgDetailClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("people");
  const [merging, setMerging] = useState(false);
  const [editing, setEditing] = useState(false);

  const people = trpc.contacts.listPeopleForOrg.useQuery({ orgId: org.id }).data ?? [];
  const deals = trpc.contacts.dealsForOrg.useQuery({ orgId: org.id }).data ?? [];
  const relatedOrgs = trpc.contacts.relatedOrgs.useQuery({ orgId: org.id }).data ?? [];
  const orgOptions = trpc.contacts.orgOptions.useQuery().data ?? [];
  const utils = trpc.useUtils();

  const openDeals = deals.filter((d) => d.status === "open");

  function onMerged(survivorId: string): void {
    setMerging(false);
    // If this record was merged away, its own URL now 404s (loader filters deletedAt),
    // so navigate to the survivor. If it survived, a refresh picks up the merged data.
    if (survivorId === org.id) router.refresh();
    else router.push(`/contacts/orgs/${survivorId}`);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[35fr_65fr] gap-6 p-4">
      <div className="min-w-0 lg:order-last">
        <header className="flex items-center justify-between gap-4 mb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={org.name} className="h-9 w-9 rounded-md text-sm" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-gray-900">{org.name}</h1>
              <ContactLabelsControl
                entityType="organization"
                entityId={org.id}
                labels={org.labels}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ContactFollowersButton
              entityType="organization"
              entityId={org.id}
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
              entityType="organization"
              entityId={org.id}
              canMerge={canMerge}
              canDelete={canDelete}
              onMerge={() => setMerging(true)}
            />
          </div>
        </header>

        {editing === true && (
          <div className="mb-4">
            <EditContactModal
              kind="org"
              org={org}
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
              kind="org"
              current={{ id: org.id, name: org.name }}
              onMerged={onMerged}
              onClose={() => setMerging(false)}
            />
          </div>
        )}

        <SharedComposeBar
          scope={{ entityType: "org", entityId: org.id }}
          emailAccountId={null}
          onActivityCreated={() => {
            void utils.contacts.contactTimeline.invalidate({
              entityType: "organization",
              entityId: org.id,
            });
            void utils.contacts.activityStats.invalidate({
              entityType: "organization",
              entityId: org.id,
            });
          }}
          onNoteCreated={() => {
            void utils.collaboration.listNotes.invalidate({
              entityType: "organization",
              entityId: org.id,
            });
            void utils.contacts.contactTimeline.invalidate({
              entityType: "organization",
              entityId: org.id,
            });
          }}
        />

        <TabStrip tabs={TABS} labels={TAB_LABELS} active={tab} onSelect={setTab} />

        <div role="tabpanel" className="pt-1">
          {tab === "people" && (
            <ListPanel
              items={people}
              empty="No people yet."
              render={(p) => (
                <li key={p.id} className="text-sm">
                  <a href={`/contacts/people/${p.id}`} className="text-blue-700 hover:underline">
                    {p.name}
                  </a>
                </li>
              )}
            />
          )}
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
          {tab === "activity" && (
            <ContactTimelinePanel entityType="organization" entityId={org.id} />
          )}
          {tab === "email" && <OrgEmailPanel />}
          {tab === "files" && <FilesPanel entityType="organization" entityId={org.id} />}
        </div>
      </div>

      <OrgSidebar
        org={org}
        defs={defs}
        hiddenBuiltins={hiddenBuiltins}
        baseCurrency={baseCurrency}
        relatedOrgs={relatedOrgs}
        orgOptions={orgOptions}
        openDealsCount={openDeals.length}
        onRelatedChanged={() => void utils.contacts.relatedOrgs.invalidate({ orgId: org.id })}
      />
    </div>
  );
}
