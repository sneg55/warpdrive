"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TeamReplyChip } from "@/features/email/TeamReplyChip";
import { cn } from "@/lib/utils";
import type { XConversationRow as Row, XListView } from "../reads";
import { X_DM_STRINGS } from "../strings";
import { formatXRelativeTime } from "./relativeTime";
import { xConversationHref } from "./xRoutes";

export function participantLabel(
  row: Pick<Row, "participantName" | "participantUsername">,
): string {
  return row.participantName ?? row.participantUsername ?? X_DM_STRINGS.unknownParticipant;
}

function Snippet({ row }: { row: Row }): React.ReactNode {
  if (row.encrypted && row.snippet === null)
    return (
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground/70">
        {X_DM_STRINGS.encryptedMarker}
      </span>
    );
  const text =
    row.snippet === null
      ? X_DM_STRINGS.unreadable
      : row.snippet === ""
        ? X_DM_STRINGS.attachment
        : row.snippet;
  return <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{text}</span>;
}

export function XConversationRow({
  accountId,
  view,
  conversation,
}: {
  accountId: string;
  view: XListView;
  conversation: Row;
}): React.ReactNode {
  const name = participantLabel(conversation);
  const weight = conversation.unread ? "font-semibold" : "font-normal";
  return (
    <li className="[content-visibility:auto] [contain-intrinsic-size:auto_52px]">
      <Link
        href={xConversationHref(accountId, conversation.id, view)}
        className="flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
      >
        <Avatar name={name} src={conversation.participantAvatarUrl} />
        <span className={cn("flex max-w-64 shrink-0 items-center gap-1.5 text-sm", weight)}>
          {conversation.unread && (
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            />
          )}
          {conversation.unread && <span className="sr-only">{X_DM_STRINGS.unread}</span>}
          {conversation.participantUsername !== null && (
            <span className="truncate">@{conversation.participantUsername}</span>
          )}
          {conversation.participantName !== null && (
            <span className="truncate text-muted-foreground">{conversation.participantName}</span>
          )}
        </span>
        <Snippet row={conversation} />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <TeamReplyChip status={conversation.replyStatus} />
          <time
            dateTime={conversation.lastMessageAt}
            className="text-xs tabular-nums text-muted-foreground"
          >
            {formatXRelativeTime(conversation.lastMessageAt)}
          </time>
        </span>
      </Link>
    </li>
  );
}
