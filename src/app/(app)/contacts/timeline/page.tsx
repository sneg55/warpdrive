import { redirect } from "next/navigation";
import { PageHeading } from "@/components/shell/PageHeading";
import { STRINGS } from "@/constants/strings";
import { createContext } from "@/server/trpc/context";
import { EngagementTimelineClient } from "./EngagementTimelineClient";

export const metadata = { title: STRINGS.contacts.timelineHeading };

export default async function ContactsTimelinePage(): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }

  return (
    <main aria-label={STRINGS.contacts.timelineHeading} className="flex flex-col gap-4">
      <PageHeading
        crumbs={[
          { label: STRINGS.nav.contacts, href: "/contacts/people" },
          { label: STRINGS.contacts.timelineHeading },
        ]}
        title={STRINGS.contacts.timelineHeading}
      />
      <EngagementTimelineClient />
    </main>
  );
}
