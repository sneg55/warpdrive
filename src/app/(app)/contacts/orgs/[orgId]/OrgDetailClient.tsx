"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import { MergeDialog } from "@/features/contacts/MergeDialog";
import type { OrgDetail } from "@/features/contacts/orgsRepo";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { OrganizationDetailHeader } from "../../ContactDetailHeader";
import { ContactTimelinePanel, FilesPanel, TabStrip } from "../../contactDetail.shared";
import { OrgEmailPanel } from "../../PersonEmailTab";
import { OrgSidebar } from "./OrgSidebar";

type Tab = "activity" | "email" | "files";

const TAB_LABELS: Record<Tab, string> = {
  activity: "Activity",
  email: "Email",
  files: "Files",
};

const TABS: readonly Tab[] = ["activity", "email", "files"];

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
  const [tab, setTab] = useState<Tab>("activity");
  const [merging, setMerging] = useState(false);

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
    <div className="flex h-full flex-col p-4">
      <OrganizationDetailHeader
        entityId={org.id}
        name={org.name}
        labels={org.labels}
        followers={followers}
        isFollowedBySelf={isFollowedBySelf}
        canMerge={canMerge}
        canDelete={canDelete}
        onMerge={() => setMerging(true)}
      />

      {merging === true && (
        <MergeDialog
          kind="org"
          current={{ id: org.id, name: org.name }}
          onMerged={onMerged}
          onClose={() => setMerging(false)}
        />
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[35fr_65fr]">
        <OrgSidebar
          org={org}
          defs={defs}
          hiddenBuiltins={hiddenBuiltins}
          baseCurrency={baseCurrency}
          relatedOrgs={relatedOrgs}
          orgOptions={orgOptions}
          openDealsCount={openDeals.length}
          people={people}
          deals={deals}
          onRelatedChanged={() => void utils.contacts.relatedOrgs.invalidate({ orgId: org.id })}
        />

        <div className="min-w-0">
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
            {tab === "activity" && (
              <ContactTimelinePanel entityType="organization" entityId={org.id} />
            )}
            {tab === "email" && <OrgEmailPanel />}
            {tab === "files" && <FilesPanel entityType="organization" entityId={org.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
