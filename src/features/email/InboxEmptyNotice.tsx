import { LoaderCircle } from "lucide-react";
import { EMAIL_SYNC_STRINGS } from "@/app/(app)/settings/email-sync/strings";
import { EmptyState } from "@/components/ui/EmptyState";
import { STRINGS } from "@/constants/strings";
import { InboxZeroIllustration } from "./InboxZeroIllustration";
import type { InboxEmptyState } from "./inboxZero";

export function InboxEmptyNotice({ state }: { state: InboxEmptyState }): React.ReactNode {
  if (state === "none") return null;
  if (state === "syncing")
    return (
      <EmptyState
        illustration={
          <LoaderCircle
            aria-hidden="true"
            className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        }
        title={STRINGS.inbox.inboxSyncingTitle}
        body={STRINGS.inbox.inboxSyncingBody}
      />
    );
  if (state === "failed")
    return (
      <EmptyState title={EMAIL_SYNC_STRINGS.statusStalled} body={EMAIL_SYNC_STRINGS.stalledHint} />
    );
  if (state === "awaitingMail")
    return (
      <EmptyState
        title={STRINGS.inbox.inboxAwaitingMailTitle}
        body={STRINGS.inbox.inboxAwaitingMailBody}
      />
    );
  return (
    <EmptyState
      illustration={<InboxZeroIllustration />}
      title={STRINGS.inbox.inboxZeroTitle}
      body={STRINGS.inbox.inboxZeroBody}
    />
  );
}
