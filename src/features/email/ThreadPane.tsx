"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { InboundAttachmentList } from "./InboundAttachmentList";
import { InboxReaderSidebar } from "./InboxReaderSidebar";
import { formatReaderDate } from "./inboxDate";
import { MessageBodyFrame } from "./MessageBodyFrame";
import { MessageTrackingHistory } from "./MessageTrackingHistory";
import { primaryCounterparty } from "./primaryCounterparty";
import { ReaderActions } from "./ReaderActions";
import { ReaderTopBar } from "./ReaderTopBar";
import { markThreadReadAction, markThreadUnreadAction } from "./readActions";
import { ThreadFollowUpControls } from "./ThreadFollowUpControls";

interface ThreadPaneProps {
  threadId: string;
  // trackingBadge: set by the parent route wrapper when a live WS email_tracking event
  // arrives for this thread. Transient only (current session), a real-time nudge. The
  // persisted per-message history (source of record, survives reload) is rendered per
  // message below via MessageTrackingHistory, fed by message.tracking.
  trackingBadge: { kind: "open" | "click" } | null;
}

export function ThreadPane({ threadId, trackingBadge }: ThreadPaneProps): React.ReactNode {
  const [allowRemote, setAllowRemote] = useState(false);
  const { data, refetch } = trpc.email.thread.get.useQuery({ threadId, allowRemote });
  const utils = trpc.useUtils();
  // Guards mark-read-on-open to fire once per thread: re-renders (e.g. from a Composer send
  // triggering refetch()) share the same threadId and must not re-fire the action.
  const markedReadForThreadId = useRef<string | null>(null);
  const [markUnreadError, setMarkUnreadError] = useState<string | null>(null);

  useEffect(() => {
    if (data === undefined) return;
    if (markedReadForThreadId.current === threadId) return;
    markedReadForThreadId.current = threadId;
    void markThreadReadAction(readCsrfToken(), { threadId }).then((res) => {
      // Silent on failure (best-effort background call): only invalidate on success so a
      // permission/CSRF failure doesn't mask itself behind a cache that looks refreshed.
      // Invalidate both queries, mirroring handleMarkUnread below: ThreadRow reads its
      // unread dot/bold from the cached inbox.list query, not unreadCount, so invalidating
      // only unreadCount left the just-opened row looking unread in the list.
      if (res.ok) {
        void utils.email.inbox.list.invalidate();
        void utils.email.inbox.unreadCount.invalidate();
      }
    });
  }, [data, threadId, utils]);

  async function handleMarkUnread(): Promise<void> {
    const res = await markThreadUnreadAction(readCsrfToken(), { threadId });
    if (!res.ok) {
      setMarkUnreadError(STRINGS.inbox.errorMarkUnread);
      return;
    }
    setMarkUnreadError(null);
    void utils.email.inbox.list.invalidate();
    void utils.email.inbox.unreadCount.invalidate();
  }

  if (data === undefined) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  const { messages, accountId, canCompose, ownerEmail, personName, dealTitle } = data;
  const inboxThread = data.thread;
  // Newest-first order (getThread), so the first message is what Reply/Reply all/Forward
  // should act on.
  const latestMessage = messages[0];
  // Distinct sender addresses = the people in this conversation (Pipedrive's right sidebar).
  const participants = [...new Set(messages.map((m) => m.fromEmail).filter((e) => e !== ""))];
  // The counterparty (never the mailbox owner) seeds the "Create new contact" prefill. Using the
  // first sender would prefill the owner's own address on a sent-only thread (codex review).
  const counterparty = primaryCounterparty(messages, ownerEmail);
  const primaryEmail = counterparty?.email ?? null;
  const primaryName = counterparty?.name ?? null;

  return (
    <div className="flex flex-col h-full">
      <ReaderTopBar threadId={inboxThread.id} canManage={canCompose} />
      <header className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold text-foreground text-balance">
            {inboxThread.subject ?? "(no subject)"}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {markUnreadError !== null && (
              <p className="text-xs text-destructive">{markUnreadError}</p>
            )}
            <button
              type="button"
              onClick={() => void handleMarkUnread()}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
            >
              {STRINGS.inbox.markAsUnread}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {inboxThread.personId !== null && (
            <a
              href={`/contacts/people/${inboxThread.personId}`}
              className="inline-block max-w-[12rem] truncate px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-xs hover:underline"
            >
              {/* Pipedrive labels the chip with the linked record's NAME, not the type noun. */}
              {personName ?? STRINGS.inbox.linkedPersonFallback}
            </a>
          )}
          {inboxThread.dealId !== null && (
            <a
              href={`/deals/${inboxThread.dealId}`}
              className="inline-block max-w-[12rem] truncate px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-xs hover:underline"
            >
              {dealTitle ?? STRINGS.inbox.linkedDealFallback}
            </a>
          )}
          {trackingBadge !== null && (
            <span className="inline-block px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
              {trackingBadge.kind === "open" ? "Opened" : "Clicked"}
            </span>
          )}
        </div>
        {/* Label + follow-up mutations are gated server-side on mailbox ownership (same predicate
            as canCompose). Only offer the controls when the user owns the mailbox, so we never
            present a clickable control the backend will reject (F5-7). */}
        {canCompose && (
          <div className="mt-2">
            <ThreadFollowUpControls
              threadId={inboxThread.id}
              followUpStatus={inboxThread.followUpStatus}
              labels={inboxThread.labels}
              onChanged={() => void refetch()}
            />
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Message list + composer (center); conversation context (right). */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {messages.map((msg) => (
              <article key={msg.gmailMessageId} className="p-4">
                <div className="flex items-center justify-between mb-2 gap-2 text-xs text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-2">
                    {/* Per-message avatar (Pipedrive shows one beside each sender). */}
                    <Avatar
                      name={msg.fromName ?? msg.fromEmail}
                      className="h-7 w-7 shrink-0 text-[10px]"
                    />
                    <span className="min-w-0 truncate">
                      {/* PD shows "Name <email>": name in the strong slot, address alongside. */}
                      <span className="font-medium text-foreground">
                        {msg.fromName ?? msg.fromEmail}
                      </span>
                      {msg.fromName !== null && (
                        <span className="ml-1.5 text-muted-foreground">{msg.fromEmail}</span>
                      )}
                      {msg.direction === "outbound" && (
                        <span className="ml-1 px-1 rounded bg-accent text-accent-foreground">
                          Sent
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatReaderDate(msg.sentAt)}</span>
                </div>
                {msg.toEmails.length > 0 && (
                  // Recipients line (Pipedrive shows To: / Cc: in the message header). Matters most
                  // on sent mail, where the row above is the counterparty but the body doesn't say
                  // who it went to.
                  <div className="mb-2 text-xs text-muted-foreground">
                    <span className="font-medium">To:</span> <span>{msg.toEmails.join(", ")}</span>
                    {msg.ccEmails.length > 0 && (
                      <>
                        {" · "}
                        <span className="font-medium">Cc:</span>{" "}
                        <span>{msg.ccEmails.join(", ")}</span>
                      </>
                    )}
                  </div>
                )}
                <MessageBodyFrame
                  html={msg.bodyHtml}
                  allowRemote={allowRemote}
                  onShowRemote={() => setAllowRemote(true)}
                />
                {msg.attachments.length > 0 && (
                  <InboundAttachmentList attachments={msg.attachments} />
                )}
                {msg.direction === "outbound" && <MessageTrackingHistory tracking={msg.tracking} />}
              </article>
            ))}
          </div>

          {/* latestMessage guard is defensive: getThread only returns threads with at least
              one email_messages row today, but nothing enforces that invariant at the DB
              level, so this avoids handing ReaderActions an undefined message if that ever
              changes. */}
          {canCompose && latestMessage !== undefined && (
            <ReaderActions
              message={latestMessage}
              selfEmail={ownerEmail}
              accountId={accountId}
              threadId={threadId}
              onSent={() => void refetch()}
            />
          )}
        </div>

        <InboxReaderSidebar
          participants={participants}
          threadId={inboxThread.id}
          personId={inboxThread.personId}
          personName={personName}
          dealId={inboxThread.dealId}
          dealTitle={dealTitle}
          subject={inboxThread.subject}
          primaryEmail={primaryEmail}
          primaryName={primaryName}
          canCompose={canCompose}
          onLinked={() => void refetch()}
        />
      </div>
    </div>
  );
}
