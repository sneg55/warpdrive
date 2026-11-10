import type { ThreadVisibilityRow } from "./emailVisibility";
import type { TeamReplyStatus } from "./replyStatus";

export type InboxFilter =
  | "all"
  | "unmatched"
  | "needs_linking"
  | "shared"
  | "private"
  | "tracked"
  | "to_me"
  | "from_contact"
  | "linked_open_deal";

export interface InboxThread {
  replyStatus?: TeamReplyStatus | null;
  id: string;
  subject: string | null;
  lastMessageAt: string | null;
  personId: string | null;
  dealId: string | null;
  visibility: string;
  unread: boolean;
  senderEmail: string | null;
  senderName: string | null;
  snippet: string | null;
  hasAttachment: boolean;
  followUpStatus: string | null;
  labels: string[];
  isOwner: boolean;
}

export interface ThreadRow {
  id: string;
  subject: string | null;
  last_message_at: string | null;
  person_id: string | null;
  deal_id: string | null;
  visibility: string;
  account_id: string;
  reply_status?: TeamReplyStatus | null;
  owner_user_id?: string;
  unread?: boolean;
  follow_up_status: string | null;
  labels: string[];
  sender_email?: string | null;
  sender_name?: string | null;
  snippet?: string | null;
  has_attachment?: boolean;
}

export function toVisibilityRow(t: ThreadRow): ThreadVisibilityRow {
  return {
    accountId: t.account_id,
    visibility: t.visibility,
    dealId: t.deal_id,
    personId: t.person_id,
    ownerUserId: t.owner_user_id,
  };
}

export function toInboxThread(
  t: {
    id: string;
    subject: string | null;
    last_message_at: string | null;
    person_id: string | null;
    deal_id: string | null;
    visibility: string;
    reply_status?: TeamReplyStatus | null;
    owner_user_id?: string;
    unread?: boolean;
    follow_up_status?: string | null;
    labels?: string[];
    sender_email?: string | null;
    sender_name?: string | null;
    snippet?: string | null;
    has_attachment?: boolean;
  },
  actorId?: string,
): InboxThread {
  return {
    replyStatus: t.reply_status ?? null,
    id: t.id,
    subject: t.subject,
    lastMessageAt: t.last_message_at,
    personId: t.person_id,
    dealId: t.deal_id,
    visibility: t.visibility,
    unread: t.unread ?? false,
    followUpStatus: t.follow_up_status ?? null,
    labels: t.labels ?? [],
    senderEmail: t.sender_email ?? null,
    senderName: t.sender_name ?? null,
    snippet: t.snippet ?? null,
    hasAttachment: t.has_attachment ?? false,
    isOwner: actorId !== undefined && t.owner_user_id !== undefined && t.owner_user_id === actorId,
  };
}

export function matchesInboxFilter(t: ThreadRow, filter: InboxFilter): boolean {
  if (filter === "unmatched") return t.person_id === null && t.deal_id === null;
  if (filter === "needs_linking") return t.person_id === null;
  return true;
}
