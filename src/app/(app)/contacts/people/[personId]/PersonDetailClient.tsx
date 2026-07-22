"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SharedComposeBar } from "@/features/compose/SharedComposeBar";
import { MergeDialog } from "@/features/contacts/MergeDialog";
import type { PersonDetail } from "@/features/contacts/personsRepo";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { PersonDetailHeader } from "../../ContactDetailHeader";
import { ContactTimelinePanel, FilesPanel, TabStrip } from "../../contactDetail.shared";
import { PersonEmailTab } from "../../PersonEmailTab";
import { PersonSidebar } from "./PersonSidebar";

type Tab = "activity" | "email" | "files";

const TAB_LABELS: Record<Tab, string> = {
  activity: "Activity",
  email: "Email",
  files: "Files",
};

const TABS: readonly Tab[] = ["activity", "email", "files"];

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
  const [tab, setTab] = useState<Tab>("activity");
  const [merging, setMerging] = useState(false);

  const utils = trpc.useUtils();

  function onMerged(survivorId: string): void {
    setMerging(false);
    // If this record was merged away, its own URL now 404s (loader filters deletedAt),
    // so navigate to the survivor. If it survived, a refresh picks up the merged data.
    if (survivorId === person.id) router.refresh();
    else router.push(`/contacts/people/${survivorId}`);
  }

  return (
    <div className="flex h-full flex-col p-4">
      <PersonDetailHeader
        entityId={person.id}
        name={person.name}
        labels={person.labels}
        followers={followers}
        isFollowedBySelf={isFollowedBySelf}
        canMerge={canMerge}
        canDelete={canDelete}
        onMerge={() => setMerging(true)}
      />

      {merging === true && (
        <MergeDialog
          kind="person"
          current={{ id: person.id, name: person.name }}
          onMerged={onMerged}
          onClose={() => setMerging(false)}
        />
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[35fr_65fr]">
        <PersonSidebar
          person={person}
          orgName={orgName}
          defs={defs}
          hiddenBuiltins={hiddenBuiltins}
          baseCurrency={baseCurrency}
        />

        <div className="min-w-0">
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
            {tab === "activity" && (
              <ContactTimelinePanel entityType="person" entityId={person.id} />
            )}
            {tab === "email" && <PersonEmailTab personId={person.id} />}
            {tab === "files" && <FilesPanel entityType="person" entityId={person.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
