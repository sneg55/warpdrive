"use client";

import { Avatar } from "@/components/ui/Avatar";
import type { ThreadMessage } from "./emailReads";
import { InboundAttachmentList } from "./InboundAttachmentList";
import { formatReaderDate } from "./inboxDate";
import { MessageBodyFrame } from "./MessageBodyFrame";
import { MessageTrackingHistory } from "./MessageTrackingHistory";

interface ReaderMessageCardProps {
  message: ThreadMessage;
  // Remote-content gate is shared across the whole thread (one "show remote content" click reveals
  // every message's remote assets), so it is lifted to ThreadPane and threaded in here.
  allowRemote: boolean;
  onShowRemote: () => void;
}

// One message in the reader's reading column, wrapped as a bordered card (PD parity B10: each
// message is a ~593px bordered card inside a constrained column, not a flat full-width article).
// Header shows the sender avatar + "Name <email>", a To/Cc recipients line, the sanitized body
// frame, inbound attachment chips, and (outbound only) the persisted open/click history.
export function ReaderMessageCard({
  message,
  allowRemote,
  onShowRemote,
}: ReaderMessageCardProps): React.ReactNode {
  return (
    <article
      data-testid="reader-message-card"
      className="rounded-md border border-border bg-card p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          {/* Per-message avatar (Pipedrive shows one beside each sender). */}
          <Avatar
            name={message.fromName ?? message.fromEmail}
            className="h-7 w-7 shrink-0 text-[10px]"
          />
          <span className="min-w-0 truncate">
            {/* PD shows "Name <email>": name in the strong slot, address alongside. */}
            <span className="font-medium text-foreground">
              {message.fromName ?? message.fromEmail}
            </span>
            {message.fromName !== null && (
              <span className="ml-1.5 text-muted-foreground">{message.fromEmail}</span>
            )}
            {message.direction === "outbound" && (
              <span className="ml-1 rounded bg-accent px-1 text-accent-foreground">Sent</span>
            )}
          </span>
        </span>
        <span className="shrink-0 tabular-nums">{formatReaderDate(message.sentAt)}</span>
      </div>
      {message.toEmails.length > 0 && (
        // Recipients line (Pipedrive shows To: / Cc: in the message header). Matters most on sent
        // mail, where the row above is the counterparty but the body doesn't say who it went to.
        <div className="mb-2 text-xs text-muted-foreground">
          <span className="font-medium">To:</span> <span>{message.toEmails.join(", ")}</span>
          {message.ccEmails.length > 0 && (
            <>
              {" · "}
              <span className="font-medium">Cc:</span> <span>{message.ccEmails.join(", ")}</span>
            </>
          )}
        </div>
      )}
      <MessageBodyFrame
        html={message.bodyHtml}
        allowRemote={allowRemote}
        onShowRemote={onShowRemote}
      />
      {message.attachments.length > 0 && (
        <InboundAttachmentList attachments={message.attachments} />
      )}
      {message.direction === "outbound" && <MessageTrackingHistory tracking={message.tracking} />}
    </article>
  );
}
