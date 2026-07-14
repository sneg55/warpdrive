"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STRINGS } from "@/constants/strings";
import { Composer } from "@/features/email/Composer";
import { ComposeLinkSidebar } from "@/features/email/composer/ComposeLinkSidebar";
import type { DraftSummary } from "@/features/email/draftRepo";
import { useInboxRealtime } from "@/features/email/useInboxRealtime";
import { trpc } from "@/lib/trpc-client";

interface ComposePageClientProps {
  accountId: string;
  fromAddress: string;
  selfActorId: string;
  draftId?: string;
}

// Shape Composer's `draft` seed prop expects. Mirrors the mapping InboxListClient used to build
// for its Sheet-hosted composer before the full-pane route replaced it.
function toComposerDraft(d: DraftSummary): {
  id: string;
  subject: string;
  bodyHtml: string;
  to: string[];
  cc: string[];
  threadId?: string | null;
  visibility: DraftSummary["visibility"];
} {
  return {
    id: d.id,
    subject: d.subject ?? "",
    bodyHtml: d.bodyHtml ?? "",
    to: d.toEmails,
    cc: d.ccEmails,
    threadId: d.threadId,
    visibility: d.visibility,
  };
}

// Full-pane compose route (Pipedrive parity): a Back bar over a two-column layout, the compose
// pane on the left and the deal-linking sidebar (ComposeLinkSidebar) on the right. Draft resume
// (?draft=<id>) has no dedicated by-id backend read, so it reuses the same drafts.list query the
// Drafts folder already fetches and matches client-side.
export function ComposePageClient({
  accountId,
  fromAddress,
  selfActorId,
  draftId,
}: ComposePageClientProps): React.ReactNode {
  const router = useRouter();
  // Opening compose unmounts InboxListClient (the full pane replaces the list), which would close
  // its realtime subscription. Keep it alive here so mail arriving during a compose session still
  // invalidates the inbox cache, exactly as the thread route does.
  useInboxRealtime({ selfActorId });
  // Only fetch the draft list when actually resuming a draft (?draft=<id>). A plain compose has no
  // draft to seed, and fetching here would cache a drafts list that autosave then mutates via a
  // server action without invalidating, hiding the new draft on a return to the Drafts folder
  // inside the stale window.
  const draftsQuery = trpc.email.drafts.list.useQuery(undefined, {
    enabled: draftId !== undefined,
  });
  const resumeDraft = draftsQuery.data?.find((d) => d.id === draftId);
  // A draftId resume has a real row to wait for: mount the composer only once drafts.list
  // resolves, so an interactive blank composer never mounts and then remounts (discarding
  // any edits) once the draft arrives. A plain compose (no draftId) has nothing to wait
  // for, so it mounts immediately regardless of this query's state. If the query errors,
  // `data` stays undefined forever (React Query does not retry indefinitely), so stop waiting
  // once it has settled in error and fall through to a fresh, unseeded composer rather than
  // spinning "Loading draft..." forever.
  const waitingForDraft =
    draftId !== undefined && draftsQuery.data === undefined && !draftsQuery.isError;
  // Picked/created deal, lifted here (not into Composer) so it survives independent of the
  // compose form fields and can be threaded into Composer's linkDealId prop.
  const [linkedDeal, setLinkedDeal] = useState<{ id: string; title: string } | null>(null);

  function backToInbox(): void {
    router.push("/inbox");
  }

  return (
    <main aria-label={STRINGS.inbox.composeTitle} className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <Link
          href="/inbox"
          aria-label={STRINGS.inbox.backToInbox}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
        >
          <BackChevron />
          {STRINGS.inbox.back}
        </Link>
        <h1 className="text-lg font-semibold">{STRINGS.inbox.composeTitle}</h1>
      </div>
      <div className="flex min-h-0 flex-1 items-start gap-6 overflow-y-auto p-4">
        <div className="flex min-w-0 flex-1 flex-col">
          {waitingForDraft ? (
            <p className="p-3 text-sm text-muted-foreground">{STRINGS.inbox.loadingDraft}</p>
          ) : (
            <Composer
              key={resumeDraft?.id ?? "new-email"}
              accountId={accountId}
              fromAddress={fromAddress}
              draft={resumeDraft !== undefined ? toComposerDraft(resumeDraft) : undefined}
              linkDealId={linkedDeal?.id}
              onSent={backToInbox}
              onClose={backToInbox}
            />
          )}
        </div>
        <div className="hidden w-[280px] shrink-0 lg:block">
          <ComposeLinkSidebar
            dealId={linkedDeal?.id ?? null}
            dealTitle={linkedDeal?.title ?? null}
            onLink={(id, title) => setLinkedDeal({ id, title })}
            onUnlink={() => setLinkedDeal(null)}
          />
        </div>
      </div>
    </main>
  );
}

function BackChevron(): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
