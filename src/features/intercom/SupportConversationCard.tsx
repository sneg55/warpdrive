"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { INTERCOM_OPEN_STATE } from "@/constants/intercom";
import { SUPPORT_STRINGS } from "@/constants/supportStrings";
import { formatReaderDate, formatTimelineEmailDate } from "@/features/email/inboxDate";
import { MessageBodyFrame } from "@/features/email/MessageBodyFrame";
import { MASK_CLASS } from "@/features/observability/replayMasking";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { buildConversationHtml } from "./conversationHtml";
import type { SupportConversationSummary, SupportScope } from "./supportTypes";

interface SupportConversationCardProps {
  conversation: SupportConversationSummary;
  scope: SupportScope;
}

function stateLabel(state: string): string {
  return SUPPORT_STRINGS.states[state] ?? state;
}

export function SupportConversationCard({
  conversation,
  scope,
}: SupportConversationCardProps): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [allowRemote, setAllowRemote] = useState(false);
  const parts = trpc.intercom.parts.useQuery(
    { conversationId: conversation.id, scope, allowRemote },
    { enabled: expanded },
  );
  const html = useMemo(
    () => (parts.data === undefined ? "" : buildConversationHtml(parts.data, formatReaderDate)),
    [parts.data],
  );
  const heading = conversation.title ?? conversation.snippet ?? SUPPORT_STRINGS.untitled;

  return (
    <article className="rounded-md border border-border bg-card">
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className={cn("truncate text-sm font-semibold text-foreground", MASK_CLASS)}>
              {heading}
            </h3>
            <Badge variant={conversation.state === INTERCOM_OPEN_STATE ? "success" : "secondary"}>
              {stateLabel(conversation.state)}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="tabular-nums">{formatTimelineEmailDate(conversation.lastPartAt)}</span>
            {" · "}
            <span>{SUPPORT_STRINGS.source}</span>
            {" · "}
            <span>{SUPPORT_STRINGS.messageCount(conversation.messageCount)}</span>
            {conversation.lastReplierName !== null && (
              <>
                {" · "}
                <span className={MASK_CLASS}>
                  {SUPPORT_STRINGS.lastReplyBy(conversation.lastReplierName)}
                </span>
              </>
            )}
          </p>
          {!expanded && conversation.title !== null && conversation.snippet !== null && (
            <p className={cn("mt-1 truncate text-xs text-muted-foreground", MASK_CLASS)}>
              {conversation.snippet}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={expanded ? SUPPORT_STRINGS.collapse : SUPPORT_STRINGS.expand}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border p-3">
          {parts.isLoading && (
            <p className="text-xs text-muted-foreground">{SUPPORT_STRINGS.loading}</p>
          )}
          {parts.isError && (
            <div className="flex items-center gap-2">
              <p role="alert" className="text-xs text-destructive">
                {SUPPORT_STRINGS.loadFailed}
              </p>
              <button
                type="button"
                onClick={() => void parts.refetch()}
                className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              >
                {SUPPORT_STRINGS.retry}
              </button>
            </div>
          )}
          {parts.data !== undefined && (
            <MessageBodyFrame
              html={html}
              allowRemote={allowRemote}
              onShowRemote={() => setAllowRemote(true)}
              title={SUPPORT_STRINGS.frameTitle}
            />
          )}
        </div>
      )}
    </article>
  );
}
