import { formatTimelineEmailDate } from "@/features/email/inboxDate";
import { cn } from "@/lib/utils";
import type { XMessageRow } from "../reads";
import { X_DM_STRINGS, X_INBOX_URL } from "../strings";

function UnreadableBody(): React.ReactNode {
  return (
    <>
      <p className="italic">{X_DM_STRINGS.unreadable}</p>
      <a
        href={X_INBOX_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold underline underline-offset-2"
      >
        {X_DM_STRINGS.openInX}
      </a>
    </>
  );
}

function bubbleTone(message: XMessageRow): string {
  if (message.unreadable) return "border border-dashed bg-muted/40 text-foreground";
  return message.direction === "outbound"
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-foreground";
}

function XMessageBubble({ message }: { message: XMessageRow }): React.ReactNode {
  const outbound = message.direction === "outbound";
  return (
    <li
      className={cn(
        "flex max-w-[80%] flex-col gap-1",
        outbound ? "self-end items-end" : "self-start",
      )}
    >
      <div
        className={cn(
          "whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
          bubbleTone(message),
        )}
      >
        {message.unreadable && <UnreadableBody />}
        {message.text !== "" && <p>{message.text}</p>}
        {message.hasMedia && <p className="italic opacity-80">{X_DM_STRINGS.attachment}</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        {outbound && message.sentByFirstName !== null && `${message.sentByFirstName} · `}
        <time dateTime={message.sentAt}>{formatTimelineEmailDate(message.sentAt)}</time>
      </p>
    </li>
  );
}

export function XMessageList({ messages }: { messages: XMessageRow[] }): React.ReactNode {
  if (messages.length === 0) return null;
  return (
    <ol aria-label={X_DM_STRINGS.messages} className="flex flex-col gap-3">
      {messages.map((m) => (
        <XMessageBubble key={m.id} message={m} />
      ))}
    </ol>
  );
}
