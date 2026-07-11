"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { STRINGS } from "@/constants/strings";
import { Composer } from "@/features/email/Composer";
import { DraftsList } from "@/features/email/DraftsList";
import type { DraftSummary } from "@/features/email/draftRepo";
import { InboxFolderRail } from "@/features/email/InboxFolderRail";
import { InboxSearchBar } from "@/features/email/InboxSearchBar";
import type { FolderKey } from "@/features/email/inboxFolders";
import { OutboxList } from "@/features/email/OutboxList";
import { ThreadList } from "@/features/email/ThreadList";
import { useInboxRealtime } from "@/features/email/useInboxRealtime";
import { trpc } from "@/lib/trpc-client";

interface Mailbox {
  id: string;
  emailAddress: string;
}
interface InboxListClientProps {
  selfActorId: string;
  folder: FolderKey;
  mailbox: Mailbox | null;
}

export function InboxListClient({
  selfActorId,
  folder,
  mailbox,
}: InboxListClientProps): React.ReactNode {
  const searchParams = useSearchParams();
  const composeParam = searchParams.get("compose");
  // Open the composer straight away when the global quick-add "+ Email" routes here (?compose=1),
  // matching Pipedrive's global compose entry point. Only meaningful with a connected mailbox.
  const [composing, setComposing] = useState(composeParam !== null && mailbox !== null);
  // Also react to the param appearing while already on /inbox: the useState initializer runs once,
  // so a same-page quick-add navigation (adds ?compose=1) would otherwise not open the composer.
  // Adjusted during render rather than in an effect, so the composer opens in the same commit as
  // the navigation instead of one frame later.
  const wantsCompose = composeParam !== null && mailbox !== null;
  const [seenWantsCompose, setSeenWantsCompose] = useState(wantsCompose);
  if (seenWantsCompose !== wantsCompose) {
    setSeenWantsCompose(wantsCompose);
    if (wantsCompose) setComposing(true);
  }
  const [resumeDraft, setResumeDraft] = useState<DraftSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const isSearching = searchQuery.trim() !== "";

  useInboxRealtime({ selfActorId });

  function closeComposer(): void {
    setComposing(false);
    setResumeDraft(null);
  }

  // In-mail search: while the box holds a non-empty query, results override whichever
  // folder tab is active (mirrors Gmail's "search overrides folder" behavior). Cleared
  // query falls back to the normal folder-driven ThreadList query.
  const searchResults = trpc.email.search.useQuery({ q: searchQuery }, { enabled: isSearching });

  const listPane =
    folder === "inbox" || folder === "sent" || folder === "archive" ? (
      <>
        <div className="shrink-0 border-b p-2">
          <InboxSearchBar onQuery={setSearchQuery} />
        </div>
        <div className="min-h-0 flex-1">
          <ThreadList
            folder={folder}
            threads={isSearching ? (searchResults.data ?? []) : undefined}
          />
        </div>
      </>
    ) : folder === "outbox" ? (
      <OutboxList />
    ) : (
      <DraftsList
        onResume={(d) => {
          setResumeDraft(d);
          setComposing(true);
        }}
      />
    );
  return (
    <main aria-label="Inbox" className="flex h-full flex-col">
      <h1 className="shrink-0 border-b px-4 py-2 text-lg font-semibold">{STRINGS.inbox.title}</h1>
      <div className="flex min-h-0 flex-1">
        <InboxFolderRail
          activeFolder={folder}
          newEmailEnabled={mailbox !== null}
          onNewEmail={() => setComposing(true)}
        />
        {/* Full-width conversation list (Pipedrive Sales Inbox parity): no persistent reading pane;
            a row opens the thread on its own page. Compose opens as a right-docked sheet. */}
        <section aria-label="Conversations" className="flex min-w-0 flex-1 flex-col">
          {listPane}
        </section>
      </div>

      {mailbox !== null && (
        <Sheet open={composing} onOpenChange={(open) => !open && closeComposer()}>
          <SheetContent aria-describedby={undefined} className="w-full sm:max-w-2xl">
            <SheetTitle className="sr-only">New email</SheetTitle>
            <div className="flex h-full min-h-0 flex-col">
              <Composer
                key={resumeDraft?.id ?? "new-email"}
                accountId={mailbox.id}
                fromAddress={mailbox.emailAddress}
                draft={
                  resumeDraft !== null
                    ? {
                        id: resumeDraft.id,
                        subject: resumeDraft.subject ?? "",
                        bodyHtml: resumeDraft.bodyHtml ?? "",
                        to: resumeDraft.toEmails,
                        cc: resumeDraft.ccEmails,
                        threadId: resumeDraft.threadId,
                      }
                    : undefined
                }
                onSent={closeComposer}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </main>
  );
}
