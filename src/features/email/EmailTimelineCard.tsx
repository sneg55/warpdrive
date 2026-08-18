"use client";

import { ChevronDown, ChevronUp, Paperclip } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { EmailCardMenu } from "./EmailCardMenu";
import type { EmailTimelineMessage } from "./entityMessageReads";
import { formatTimelineEmailDate } from "./inboxDate";
import { invalidateRecordTimelines } from "./invalidateRecordTimelines";
import { linkThread } from "./linkActions";
import { ReaderActions } from "./ReaderActions";
import { ReaderMessageCard } from "./ReaderMessageCard";
import type { ReplyMode } from "./replyPrefill";

// Which record's timeline this card sits on. Unlink clears exactly that link and leaves the
// other one alone, so detaching a thread from a deal keeps it on the person it belongs to.
export type EmailCardScope =
  | { kind: "deal"; dealId: string }
  | { kind: "person"; personId: string };

interface EmailTimelineCardProps {
  message: EmailTimelineMessage;
  scope: EmailCardScope;
  // Refetch the record's message list after the thread is detached.
  onUnlinked: () => void;
}

// One linked email as a deal or person timeline row (Pipedrive parity): collapsed to subject,
// meta line and snippet, expanding in place to the full body. Bodies never ship with the list,
// so expanding is what fetches this message and nothing else.
export function EmailTimelineCard({
  message,
  scope,
  onUnlinked,
}: EmailTimelineCardProps): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [allowRemote, setAllowRemote] = useState(false);
  const [composeMode, setComposeMode] = useState<ReplyMode | null>(null);
  const reportError = useActionError();
  const utils = trpc.useUtils();

  const body = trpc.email.message.get.useQuery(
    { messageId: message.messageId, allowRemote },
    { enabled: expanded },
  );

  async function handleUnlink(): Promise<void> {
    const patch =
      scope.kind === "deal"
        ? { threadId: message.threadId, dealId: null }
        : { threadId: message.threadId, personId: null };
    const res = await linkThread(readCsrfToken(), patch);
    // Never silently no-op: a denied unlink must say so rather than leaving the card in place
    // with no explanation.
    if (!res.ok) {
      reportError(res.error.id);
      return;
    }
    onUnlinked();
  }

  // The mode is what the composer opens in, so Forward never lands on a Reply prefill.
  function startCompose(mode: ReplyMode): void {
    setExpanded(true);
    setComposeMode(mode);
  }

  const toLine = message.toEmails[0] ?? "";

  return (
    <article className="rounded-md border border-border bg-card">
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {message.subject ?? "(no subject)"}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {/* No Gmail Date header: mergeEmailItems orders such a message by createdAt, so date
                it by createdAt too rather than leaving the slot blank. */}
            <span className="tabular-nums">
              {formatTimelineEmailDate(message.sentAt ?? message.createdAt)}
            </span>
            {" · "}
            <span>{message.fromName ?? message.fromEmail}</span>
            {toLine !== "" && (
              <span>
                {" "}
                {"→"} To: {toLine}
              </span>
            )}
            {message.hasAttachment && (
              <Paperclip className="ml-1 inline h-3 w-3" aria-label="Has attachment" />
            )}
          </p>
          {!expanded && message.snippet !== null && message.snippet !== "" && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{message.snippet}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={expanded ? STRINGS.inbox.collapseEmail : STRINGS.inbox.expandEmail}
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          {message.canCompose && (
            <button
              type="button"
              onClick={() => startCompose("reply")}
              className="rounded px-2 py-1 text-xs text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
            >
              {STRINGS.inbox.replyAction}
            </button>
          )}
          <EmailCardMenu
            threadId={message.threadId}
            canCompose={message.canCompose}
            onReplyAll={() => startCompose("replyAll")}
            onForward={() => startCompose("forward")}
            onUnlink={() => void handleUnlink()}
            unlinkLabel={
              scope.kind === "deal" ? STRINGS.inbox.unlinkFromDeal : STRINGS.inbox.unlinkFromPerson
            }
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-3">
          {body.isLoading && (
            <p className="text-xs text-muted-foreground">{STRINGS.inbox.loadingEmail}</p>
          )}
          {/* An error must not read as an empty body: say it failed and offer the retry. */}
          {body.isError && (
            <div className="flex items-center gap-2">
              <p role="alert" className="text-xs text-destructive">
                {STRINGS.inbox.emailBodyFailed}
              </p>
              <button
                type="button"
                onClick={() => void body.refetch()}
                className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              >
                {STRINGS.inbox.retry}
              </button>
            </div>
          )}
          {body.data !== undefined && (
            <>
              <ReaderMessageCard
                message={body.data}
                allowRemote={allowRemote}
                onShowRemote={() => setAllowRemote(true)}
              />
              {composeMode !== null && message.canCompose && (
                <div className="mt-3">
                  {/* Keyed on the mode so picking a second mode re-seeds the composer instead of
                      leaving it on the one it opened with. */}
                  <ReaderActions
                    key={composeMode}
                    initialMode={composeMode}
                    message={body.data}
                    selfEmail={body.data.ownerEmail}
                    accountId={body.data.accountId}
                    threadId={message.threadId}
                    onSent={() => {
                      setComposeMode(null);
                      // A reply can land under a deal and a person at once, so refresh both rather
                      // than only the record this card happens to sit on.
                      invalidateRecordTimelines(utils);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
