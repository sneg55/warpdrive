// Shared thread shape and mappers. Extracted from emailReads.ts (300-line cap split) so the
// Inbox list, the Sent/Archive folder reads, and getThread all project the same shape and cannot
// drift. Holds no queries, so it can be imported from either side without a cycle.
import type { ThreadVisibilityRow } from "./emailVisibility";

// Linking tabs (all/unmatched/needs_linking) are decided post-query in matchesInboxFilter; the U5
// quick-filters (shared/private/tracked/to_me/from_contact/linked_open_deal) are decided in SQL in
// inboxList.ts, so matchesInboxFilter lets them pass. Single-select: picking one clears the others.
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
  id: string;
  subject: string | null;
  lastMessageAt: string | null;
  personId: string | null;
  dealId: string | null;
  visibility: string;
  unread: boolean;
  // Latest message's sender name/address and preview snippet, for the Pipedrive-style list row
  // (sender column + subject/snippet). Null when not projected (only the Inbox list joins them).
  // senderName is the parsed From display name; the row shows it and falls back to senderEmail.
  senderEmail: string | null;
  senderName: string | null;
  snippet: string | null;
  // True when any message in the thread carries an attachment (Pipedrive shows a paperclip on
  // the row). Only the Inbox list projects it; other callers default false.
  hasAttachment: boolean;
  // Reader follow-up controls (B1), local only. followUpStatus null = unset (distinct from
  // the explicit "none" constant value); labels defaults to [] at the DB layer.
  followUpStatus: string | null;
  labels: string[];
  // True when the viewing actor owns this thread's mailbox (P5). Gates the per-row privacy toggle:
  // only the owner may flip visibility. Defaults false for reads that do not project the owner
  // (e.g. the chrome-less "linked" deal/contact Email tabs).
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
  // Mailbox owner, projected from the email_accounts join so per-row visibility needs no lookup.
  owner_user_id?: string;
  unread?: boolean;
  follow_up_status: string | null;
  labels: string[];
  // Optional: only the Inbox list projects the latest message's sender + snippet (lateral join).
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

// Map a raw thread row (snake_case) to the camelCase InboxThread. Shared with folderReads so
// the Inbox/Sent/Archive lists cannot drift in how they project the same shape. `unread` is
// optional: only Inbox's query computes it live (per-viewer email_thread_reads join); other
// callers default it to false.
export function toInboxThread(
  t: {
    id: string;
    subject: string | null;
    last_message_at: string | null;
    person_id: string | null;
    deal_id: string | null;
    visibility: string;
    owner_user_id?: string;
    unread?: boolean;
    follow_up_status?: string | null;
    labels?: string[];
    sender_email?: string | null;
    sender_name?: string | null;
    snippet?: string | null;
    has_attachment?: boolean;
  },
  // The viewing actor's id, so isOwner reflects THIS viewer. Omitted by reads that never surface
  // the owner-only privacy toggle (isOwner then stays false).
  actorId?: string,
): InboxThread {
  return {
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

// Post-query narrowing for the inbox filter chips. Visibility is decided separately.
export function matchesInboxFilter(t: ThreadRow, filter: InboxFilter): boolean {
  if (filter === "unmatched") return t.person_id === null && t.deal_id === null;
  if (filter === "needs_linking") return t.person_id === null;
  return true;
}
