import type { ReactNode } from "react";
import { db } from "@/db/client";
import { getActorMailboxStatus } from "@/features/email/mailboxOwnership";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { SettingsPage } from "../SettingsSurface";
import { EmailSyncClient } from "./EmailSyncClient";
import { EMAIL_SYNC_STRINGS } from "./strings";

export const metadata = { title: EMAIL_SYNC_STRINGS.title };

export default async function EmailSyncPage(): Promise<ReactNode> {
  const { actor } = await createContext();
  if (actor === null)
    return <p className="text-sm text-red-600">{EMAIL_SYNC_STRINGS.requiresAuth}</p>;

  const mailbox = await getActorMailboxStatus(db, actor.id, AbortSignal.timeout(5000));

  return (
    <SettingsPage>
      <SettingsHeading title={EMAIL_SYNC_STRINGS.title} description={EMAIL_SYNC_STRINGS.intro} />
      <EmailSyncClient
        mailbox={
          mailbox === null
            ? null
            : {
                id: mailbox.id,
                emailAddress: mailbox.emailAddress,
                status: mailbox.status,
                lastSyncAtIso: mailbox.lastSyncAt?.toISOString() ?? null,
                lastErrorId: mailbox.lastErrorId,
              }
        }
      />
    </SettingsPage>
  );
}
